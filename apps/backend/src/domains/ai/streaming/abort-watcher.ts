import type { Redis } from "@upstash/redis/cloudflare";
import { isAbortRequested } from "./resume-store";

export function startAbortWatcher(args: {
    redis: Redis;
    userKey: string;
    streamId: string;
    controller: AbortController;
    intervalMs?: number;
    signal: AbortSignal;
}): void {
    const { redis, userKey, streamId, controller, intervalMs = 1000, signal } = args;
    const tick = async () => {
        if (signal.aborted) return;
        try {
            if (await isAbortRequested(redis, userKey, streamId)) {
                controller.abort(new Error("AI_ABORTED"));
                return;
            }
        } catch {}
        if (!signal.aborted) setTimeout(tick, intervalMs);
    };
    setTimeout(tick, intervalMs);
}
