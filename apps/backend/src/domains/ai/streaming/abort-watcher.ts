/**
 * Cross-isolate hard cancel — idle fallback (doc Update 4 §7.4).
 *
 * The producing invocation cannot receive a function call from the *stop*
 * invocation (different isolate); Redis bridges them. PRIMARY abort detection is
 * folded into `flushChunks` (§15.6) — every flush returns `abortRequested`, so
 * during active token output the producer learns of an abort on its next flush
 * with zero extra requests. This watcher is the FALLBACK for *silent* stretches
 * (e.g. a long tool call emitting no deltas, so no flushes happen): it polls only
 * when the producer would otherwise be quiet.
 */
import type { Redis } from "@upstash/redis/cloudflare";
import { isAbortRequested } from "./resume-store";

export function startAbortWatcher(args: {
    redis: Redis;
    userKey: string;
    streamId: string;
    controller: AbortController;
    /** Fallback cadence; the flush path is faster, so 1s keeps idle volume low. */
    intervalMs?: number;
    /** The controller's own signal → stop polling once done (abort/timeout/finish). */
    signal: AbortSignal;
}): void {
    const { redis, userKey, streamId, controller, intervalMs = 1000, signal } = args;
    const tick = async () => {
        if (signal.aborted) return;
        try {
            if (await isAbortRequested(redis, userKey, streamId)) {
                controller.abort(new Error("AI_ABORTED"));
                return; // stop watching
            }
        } catch {
            /* transient redis error → keep trying */
        }
        if (!signal.aborted) setTimeout(tick, intervalMs);
    };
    setTimeout(tick, intervalMs);
}
