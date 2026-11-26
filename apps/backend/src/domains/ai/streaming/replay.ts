import type { Redis } from "@upstash/redis/cloudflare";
import { readSince } from "./resume-store";

const TAIL_IDLE_MS = 200;

const SILENT_PRODUCER_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildResumeStream(redis: Redis, userKey: string, sid: string): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    let lastId = "-";
    let lastFrameAt = Date.now();
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            for (;;) {
                const { frames, state } = await readSince(redis, userKey, sid, lastId);
                for (const { id, frame } of frames) {
                    controller.enqueue(enc.encode(frame));
                    lastId = id;
                    lastFrameAt = Date.now();
                }
                if (frames.length > 0) return;
                if (state !== "active" || Date.now() - lastFrameAt > SILENT_PRODUCER_MS) {
                    controller.close();
                    return;
                }
                await sleep(TAIL_IDLE_MS);
            }
        },
        cancel() {},
    });
}
