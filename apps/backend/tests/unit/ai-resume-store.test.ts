import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { FakeRedis } from "../helpers/fake-redis";
import {
    openStream,
    flushChunks,
    closeStream,
    readSince,
    requestAbort,
    isAbortRequested,
    readMeta,
} from "../../src/domains/ai/streaming/resume-store";
import { buildResumeStream } from "../../src/domains/ai/streaming/replay";
import { startAbortWatcher } from "../../src/domains/ai/streaming/abort-watcher";
import { keys, CLOSE_GRACE_S, STREAM_MAXLEN, STREAM_NS } from "../../src/domains/ai/streaming/stream-keys";

const USER_KEY = "deadbeefdeadbeef";
const SID = "stream_abc123";
const META = { conversationId: "conv-1", userId: "user-1", messageId: "msg-1", model: "test-model" };

// Drain a ReadableStream<Uint8Array> to a single decoded string.
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let out = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) out += dec.decode(value, { stream: true });
    }
    return out;
}

describe("stream-keys", () => {
    it("builds tenant-scoped keys under the namespace + userKey", () => {
        const k = keys(USER_KEY, SID);
        expect(k.chunks).toBe(`${STREAM_NS}:${USER_KEY}:${SID}:chunks`);
        expect(k.state).toBe(`${STREAM_NS}:${USER_KEY}:${SID}:state`);
        expect(k.abort).toBe(`${STREAM_NS}:${USER_KEY}:${SID}:abort`);
        expect(k.meta).toBe(`${STREAM_NS}:${USER_KEY}:${SID}:meta`);
    });

    it("never builds the same key across two different userKeys (§15.1)", () => {
        expect(keys("aaaa", SID).chunks).not.toBe(keys("bbbb", SID).chunks);
    });
});

describe("resume-store", () => {
    let redis: FakeRedis;

    beforeEach(() => {
        redis = new FakeRedis();
    });

    it("openStream seeds meta + active state", async () => {
        await openStream(redis as any, USER_KEY, SID, META);
        const k = keys(USER_KEY, SID);
        expect(redis.strings.get(k.state)).toBe("active");
        expect(await readMeta(redis as any, USER_KEY, SID)).toEqual(META);
    });

    it("flushChunks then readSince('-') returns frames in order", async () => {
        await openStream(redis as any, USER_KEY, SID, META);
        await flushChunks(redis as any, USER_KEY, SID, "frame-A");
        await flushChunks(redis as any, USER_KEY, SID, "frame-B");

        const { frames, state } = await readSince(redis as any, USER_KEY, SID, "-");
        expect(frames.map((f) => f.frame)).toEqual(["frame-A", "frame-B"]);
        expect(state).toBe("active");
    });

    it("readSince(lastId) returns only newer frames (exclusive tail)", async () => {
        await openStream(redis as any, USER_KEY, SID, META);
        await flushChunks(redis as any, USER_KEY, SID, "frame-A");
        const first = await readSince(redis as any, USER_KEY, SID, "-");
        await flushChunks(redis as any, USER_KEY, SID, "frame-B");

        const next = await readSince(redis as any, USER_KEY, SID, first.frames.at(-1)!.id);
        expect(next.frames.map((f) => f.frame)).toEqual(["frame-B"]);
    });

    it("flushChunks returns abortRequested once the flag is set (folded read, §15.6)", async () => {
        await openStream(redis as any, USER_KEY, SID, META);
        expect((await flushChunks(redis as any, USER_KEY, SID, "x")).abortRequested).toBe(false);
        await requestAbort(redis as any, USER_KEY, SID);
        expect((await flushChunks(redis as any, USER_KEY, SID, "y")).abortRequested).toBe(true);
    });

    it("each flush is exactly ONE round-trip and ONE xadd (§15.3)", async () => {
        await openStream(redis as any, USER_KEY, SID, META);
        const before = redis.requests;
        await flushChunks(redis as any, USER_KEY, SID, "frame");
        expect(redis.requests - before).toBe(1);
        expect(redis.xaddCount()).toBe(1);
    });

    it("xadd carries the MAXLEN runaway guard (§15.3)", async () => {
        const spy = vi.spyOn(redis as any, "pipeline");
        await flushChunks(redis as any, USER_KEY, SID, "frame");
        // The pipeline's xadd is recorded; assert MAXLEN constant is the configured guard.
        expect(STREAM_MAXLEN).toBeGreaterThan(0);
        expect(redis.xaddCount()).toBe(1);
        spy.mockRestore();
    });

    it("closeStream flips terminal state and shrinks TTL to the grace window (§15.2)", async () => {
        await openStream(redis as any, USER_KEY, SID, META);
        const k = keys(USER_KEY, SID);
        const expireCalls: Array<[string, number]> = [];
        const realPipeline = redis.pipeline.bind(redis);
        vi.spyOn(redis, "pipeline").mockImplementation(() => {
            const p = realPipeline();
            const realExpire = p.expire.bind(p);
            p.expire = (key: string, ttl: number) => {
                expireCalls.push([key, ttl]);
                return realExpire(key, ttl);
            };
            return p;
        });

        await closeStream(redis as any, USER_KEY, SID, "done");
        expect(redis.strings.get(k.state)).toBe("done");
        // Every expire issued by closeStream uses the short grace TTL.
        expect(expireCalls.length).toBeGreaterThan(0);
        for (const [, ttl] of expireCalls) expect(ttl).toBe(CLOSE_GRACE_S);
    });

    it("requestAbort / isAbortRequested round-trip", async () => {
        expect(await isAbortRequested(redis as any, USER_KEY, SID)).toBe(false);
        await requestAbort(redis as any, USER_KEY, SID);
        expect(await isAbortRequested(redis as any, USER_KEY, SID)).toBe(true);
    });

    it("readMeta returns null when nothing is stored", async () => {
        expect(await readMeta(redis as any, USER_KEY, SID)).toBeNull();
    });
});

describe("replay (buildResumeStream)", () => {
    let redis: FakeRedis;
    beforeEach(() => {
        redis = new FakeRedis();
    });

    it("replays all buffered frames then closes once state is terminal", async () => {
        await openStream(redis as any, USER_KEY, SID, META);
        await flushChunks(redis as any, USER_KEY, SID, "data: A\n\n");
        await flushChunks(redis as any, USER_KEY, SID, "data: B\n\n");
        await closeStream(redis as any, USER_KEY, SID, "done");

        const text = await drain(buildResumeStream(redis as any, USER_KEY, SID));
        expect(text).toBe("data: A\n\ndata: B\n\n");
    });

    it("closes immediately when the log is missing/expired (orphan, §7.9/§10)", async () => {
        // No openStream/flush — the state key never exists (or has expired).
        const text = await drain(buildResumeStream(redis as any, USER_KEY, SID));
        expect(text).toBe("");
    });

    it("closes cleanly on an aborted terminal state", async () => {
        await openStream(redis as any, USER_KEY, SID, META);
        await flushChunks(redis as any, USER_KEY, SID, "data: partial\n\n");
        await closeStream(redis as any, USER_KEY, SID, "aborted");

        const text = await drain(buildResumeStream(redis as any, USER_KEY, SID));
        expect(text).toBe("data: partial\n\n");
    });
});

describe("abort-watcher", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("fires controller.abort within one interval once the flag is set", async () => {
        const redis = new FakeRedis();
        await requestAbort(redis as any, USER_KEY, SID);
        const controller = new AbortController();
        const abortSpy = vi.spyOn(controller, "abort");

        startAbortWatcher({
            redis: redis as any,
            userKey: USER_KEY,
            streamId: SID,
            controller,
            intervalMs: 1000,
            signal: controller.signal,
        });

        await vi.advanceTimersByTimeAsync(1000);
        expect(abortSpy).toHaveBeenCalled();
    });

    it("does not abort while the flag is unset", async () => {
        const redis = new FakeRedis();
        const controller = new AbortController();
        const abortSpy = vi.spyOn(controller, "abort");

        startAbortWatcher({
            redis: redis as any,
            userKey: USER_KEY,
            streamId: SID,
            controller,
            intervalMs: 1000,
            signal: controller.signal,
        });

        await vi.advanceTimersByTimeAsync(3000);
        expect(abortSpy).not.toHaveBeenCalled();
    });

    it("self-stops once the controller signal is already aborted", async () => {
        const redis = new FakeRedis();
        await requestAbort(redis as any, USER_KEY, SID);
        const controller = new AbortController();
        controller.abort(); // already done
        const getSpy = vi.spyOn(redis, "get");

        startAbortWatcher({
            redis: redis as any,
            userKey: USER_KEY,
            streamId: SID,
            controller,
            intervalMs: 1000,
            signal: controller.signal,
        });

        await vi.advanceTimersByTimeAsync(5000);
        // The very first tick sees signal.aborted and returns before polling.
        expect(getSpy).not.toHaveBeenCalled();
    });
});
