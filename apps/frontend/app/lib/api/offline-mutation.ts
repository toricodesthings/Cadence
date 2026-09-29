import type { MutationOp } from "./offline-wal";
import { enqueueWalEntry, getWalSnapshot, walTargetIds } from "./offline-wal";
import { requestReplay, toRequests } from "./mutation-executor";
import { isNetworkFailure } from "../../types/api";

/** Writes to one entity run in order, so an edit never overtakes the create it depends on. */
const lastWriteById = new Map<string, Promise<unknown>>();

function afterPreviousWrites<T>(ids: string[], write: () => Promise<T>): Promise<T> {
    const previous = Promise.all(ids.map((id) => lastWriteById.get(id)?.catch(() => undefined)));
    const next = previous.then(write);
    for (const id of ids) lastWriteById.set(id, next);
    void next.catch(() => undefined).finally(() => {
        for (const id of ids) if (lastWriteById.get(id) === next) lastWriteById.delete(id);
    });
    return next;
}

/** Queued changes must land first, or this one could reach the server out of order. */
function mustQueue(op: MutationOp): boolean {
    const ids = new Set(walTargetIds(op));
    return getWalSnapshot().some((e) =>
        e.status !== "failed" || walTargetIds(e.op).some((id) => ids.has(id)));
}

/** Chromium only (Android): lets the service worker replay after the app is closed. */
function registerBackgroundSync() {
    void navigator.serviceWorker?.getRegistration().then((registration) =>
        (registration as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined)
            ?.sync?.register("cadence-wal"),
    ).catch(() => {});
}

async function enqueue(op: MutationOp) {
    await enqueueWalEntry(op, toRequests(op));
    registerBackgroundSync();
    requestReplay();
}

/**
 * Wraps a mutation function to support offline queueing.
 *
 * Online: calls the API function directly. Offline, on a network failure (weak
 * signal, timeout), or while earlier changes wait in the queue: serializes the
 * operation to the durable WAL and returns `undefined`. 4xx/5xx answers still throw.
 *
 * Hooks should guard `onSuccess` against undefined results (queued case).
 */
export function withOfflineSupport<TInput, TResult>(
    toOp: (input: TInput) => MutationOp,
    apiFn: (input: TInput) => Promise<TResult>,
): (input: TInput) => Promise<TResult | undefined> {
    return (input: TInput) => {
        const op = toOp(input);
        return afterPreviousWrites(walTargetIds(op), async () => {
            if (!navigator.onLine || mustQueue(op)) {
                await enqueue(op);
                return undefined;
            }
            try {
                return await apiFn(input);
            } catch (error) {
                if (!isNetworkFailure(error)) throw error;
                await enqueue(op);
                return undefined;
            }
        });
    };
}

/** A write that was queued (not answered, not failed): skip the refetch, or it would show the server's older copy until the queue syncs. */
export function wasQueued(data: unknown, error: unknown): boolean {
    return data === undefined && !error;
}
