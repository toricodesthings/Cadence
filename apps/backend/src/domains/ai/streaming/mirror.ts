import type { Redis } from "@upstash/redis/cloudflare";
import { flushChunks } from "./resume-store";

const FLUSH_MS = 100;
const FLUSH_BYTES = 16 * 1024;

export async function mirrorChunks(args: {
    stream: ReadableStream<string>;
    redis: Redis;
    userKey: string;
    streamId: string;
    controller: AbortController;
}): Promise<void> {
    const { stream, redis, userKey, streamId, controller } = args;
    const reader = stream.getReader();
    let buf = "";
    let lastFlush = Date.now();
    const flush = async () => {
        if (!buf) return;
        const blob = buf;
        buf = "";
        lastFlush = Date.now();
        const { abortRequested } = await flushChunks(redis, userKey, streamId, blob).catch(() => ({
            abortRequested: false,
        }));
        if (abortRequested) controller.abort(new Error("AI_ABORTED"));
    };
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) buf += value;
            if (buf.length >= FLUSH_BYTES || Date.now() - lastFlush >= FLUSH_MS) await flush();
        }
        await flush();
    } catch {}
}
