import { beforeEach, describe, expect, it, vi } from "vitest";

const nightlyForUser = vi.fn();
const learnFromConversation = vi.fn();
vi.mock("../../src/domains/ai/memory/nightly", () => ({ nightlyForUser }));
vi.mock("../../src/domains/ai/memory/learn", () => ({ learnFromConversation }));
vi.mock("../../src/domains/ai/memory/note-learn", () => ({ learnFromNote: vi.fn(), pendingNotes: vi.fn() }));
vi.mock("../../src/platform/db", () => ({ getDbClient: () => ({}) }));

const { handleMemoryBatch } = await import("../../src/domains/ai/memory/memory-job");
const { sendMemoryMessages, scheduleLearn, learnPendingKey } = await import("../../src/domains/ai/memory/queue");
const { FakeRedis } = await import("../helpers/fake-redis");
const redisAccess = await import("../../src/platform/redis");

const at = "2026-10-12T07:00:00Z";
const message = (body: unknown) => ({ body, ack: vi.fn(), retry: vi.fn() });

describe("memory queue", () => {
    beforeEach(() => vi.clearAllMocks());

    it("sends in chunks of 100, and reports no queue so the caller runs in-process", async () => {
        const sendBatch = vi.fn();
        const messages = Array.from({ length: 250 }, (_, i) => ({ kind: "nightly" as const, userId: `u${i}`, at }));
        expect(await sendMemoryMessages({ MEMORY_QUEUE: { sendBatch } } as any, messages)).toBe(true);
        expect(sendBatch.mock.calls.map(([chunk]) => chunk.length)).toEqual([100, 100, 50]);
        expect(await sendMemoryMessages({} as any, messages)).toBe(false);
    });

    it("runs the person's nightly pass, acks on success, retries a failure, and drops a malformed message", async () => {
        nightlyForUser.mockResolvedValueOnce({ expired: 1, decayed: 0, merged: 0, evicted: 0, activity: 0 }).mockResolvedValueOnce(null);
        const [ok, failed, bad] = [message({ kind: "nightly", userId: "a", at }), message({ kind: "nightly", userId: "b", at }), message({ kind: "nope" })];
        await handleMemoryBatch({ messages: [ok, failed, bad] } as any, {} as any);
        expect(nightlyForUser).toHaveBeenCalledTimes(2);
        expect(nightlyForUser.mock.calls[0].slice(1)).toEqual(["a", new Date(at)]);
        expect(ok.ack).toHaveBeenCalled();
        expect(failed.retry).toHaveBeenCalled();
        expect(failed.ack).not.toHaveBeenCalled();
        expect(bad.ack).toHaveBeenCalled();
    });

    it("clears the 'already queued' marker when the send fails", async () => {
        const redis = new FakeRedis();
        const spy = vi.spyOn(redisAccess, "getRateLimitRedis").mockReturnValue(redis as never);
        try {
            const sendBatch = vi.fn().mockRejectedValue(new Error("queue down"));
            await scheduleLearn({ MEMORY_QUEUE: { sendBatch } } as any, "user-1");
            expect(sendBatch).toHaveBeenCalled();
            expect(redis.strings.has(await learnPendingKey("user-1"))).toBe(false);
        } finally { spy.mockRestore(); }
    });
});
