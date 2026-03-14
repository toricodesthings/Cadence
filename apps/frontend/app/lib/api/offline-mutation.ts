import type { MutationOp } from "./offline-wal";
import { enqueueWalEntry } from "./offline-wal";

/**
 * Wraps a mutation function to support offline queueing.
 *
 * When online: calls the API function directly.
 * When offline: serializes the operation to the durable WAL and returns `undefined`.
 *
 * Hooks should guard `onSuccess` against undefined results (offline case).
 */
export function withOfflineSupport<TInput, TResult>(
    toOp: (input: TInput) => MutationOp,
    apiFn: (input: TInput) => Promise<TResult>,
): (input: TInput) => Promise<TResult | undefined> {
    return async (input: TInput) => {
        if (navigator.onLine) {
            return apiFn(input);
        }
        await enqueueWalEntry(toOp(input));
        return undefined;
    };
}
