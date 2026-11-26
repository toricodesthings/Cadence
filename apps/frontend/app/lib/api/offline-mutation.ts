import type { MutationOp } from "./offline-wal";
import { enqueueWalEntry, getWalSnapshot, walTargetIds } from "./offline-wal";
import { requestReplay, toRequests } from "./mutation-executor";
import { isNetworkFailure } from "../../types/api";
import { isSessionHeld } from "./client";

const lastWriteById = new Map<string, Promise<unknown>>();

function afterPreviousWrites<T>(ids: string[], write: () => Promise<T>): Promise<T> {
    const previous = Promise.all(ids.map((id) => lastWriteById.get(id)?.catch(() => undefined)));
    const next = previous.then(write);
    for (const id of ids) lastWriteById.set(id, next);
    void next
        .catch(() => undefined)
        .finally(() => {
            for (const id of ids) if (lastWriteById.get(id) === next) lastWriteById.delete(id);
        });
    return next;
}

function mustQueue(op: MutationOp): boolean {
    const ids = new Set(walTargetIds(op));
    return getWalSnapshot().some((e) => e.status !== "failed" || walTargetIds(e.op).some((id) => ids.has(id)));
}

function registerBackgroundSync() {
    void navigator.serviceWorker
        ?.getRegistration()
        .then((registration) =>
            (
                registration as
                    | (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })
                    | undefined
            )?.sync?.register("cadence-wal"),
        )
        .catch(() => {});
}

async function enqueue(op: MutationOp) {
    await enqueueWalEntry(op, toRequests(op));
    registerBackgroundSync();
    requestReplay();
}

export function withOfflineSupport<TInput, TResult>(
    toOp: (input: TInput) => MutationOp,
    apiFn: (input: TInput) => Promise<TResult>,
): (input: TInput) => Promise<TResult | undefined> {
    return (input: TInput) => {
        const op = toOp(input);
        return afterPreviousWrites(walTargetIds(op), async () => {
            if (!navigator.onLine || isSessionHeld() || mustQueue(op)) {
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

export function wasQueued(data: unknown, error: unknown): boolean {
    return data === undefined && !error;
}
