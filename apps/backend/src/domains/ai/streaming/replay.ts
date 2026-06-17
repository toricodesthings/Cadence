/**
 * Resume readable stream (doc Update 4 §7.5).
 *
 * Builds the `ReadableStream<Uint8Array>` the GET resume endpoint returns. On the
 * FIRST read it replays every buffered frame (full reconstruction from frame 0),
 * then tails. Each `pull` is exactly ONE Upstash request (tail + terminal state
 * combined, §15.3) and only runs while the client keeps reading (backpressure-
 * friendly). Closes cleanly once the state is terminal and the tail is caught up —
 * including the `finish` frame — so `useChat` sees a normal stream end. Pure read
 * side: a resume never mutates the log or the abort flag.
 */
import type { Redis } from "@upstash/redis/cloudflare";
import { readSince } from "./resume-store";

/** Idle backoff between tail polls when the producer hasn't emitted new frames. */
const TAIL_IDLE_MS = 200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildResumeStream(
    redis: Redis,
    userKey: string,
    sid: string,
): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    let lastId = "-"; // "-" = from the start (full replay), then exclusive tail
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            // ONE pipelined request returns the tail AND the terminal state.
            const { frames, state } = await readSince(redis, userKey, sid, lastId);
            for (const { id, frame } of frames) {
                controller.enqueue(enc.encode(frame));
                lastId = id;
            }
            // Caught up and not still producing → end the resume cleanly. A null
            // state means the log expired (orphan from a crashed isolate, §7.9/§10);
            // a terminal state means the producer finished — both close immediately.
            if (frames.length === 0 && state !== "active") {
                controller.close();
                return;
            }
            // Caught up but still active → back off before the next tail poll.
            if (frames.length === 0) await sleep(TAIL_IDLE_MS);
        },
        cancel() {
            /* reader gave up; nothing to clean — the producer owns the log */
        },
    });
}
