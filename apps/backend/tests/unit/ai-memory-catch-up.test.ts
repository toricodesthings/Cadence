import { describe, expect, it } from "vitest";
import { catchUpOf, newBackfill } from "../../src/domains/ai/memory/backfill";

describe("catchUpOf: a rough share of Full's 3-month read", () => {
    const start = new Date("2026-10-01T12:00:00Z");
    const fresh = newBackfill(start);
    const day = 24 * 60 * 60_000;

    it("starts at 5% so the bar shows, and moves with how far back the chats are read", () => {
        expect(catchUpOf(fresh, start)).toEqual({ progress: 0.05, learned: 0, doneAt: null });
        const half = { ...fresh, before: new Date(start.getTime() - 45 * day).toISOString(), learned: 4 };
        expect(catchUpOf(half, start)).toEqual({ progress: 0.45, learned: 4, doneAt: null });
    });

    it("sits at 90% while notes are read, then shows the finish for a week", () => {
        expect(catchUpOf({ ...fresh, chats: "done" }, start)?.progress).toBe(0.9);
        const done = { ...fresh, chats: "done" as const, notes: "done" as const, doneAt: start.toISOString(), learned: 12 };
        expect(catchUpOf(done, new Date(start.getTime() + 6 * day))).toEqual({ progress: 1, learned: 12, doneAt: start.toISOString() });
        expect(catchUpOf(done, new Date(start.getTime() + 8 * day))).toBeNull();
    });

    it("is null with no catch-up, or a finished one with no date", () => {
        expect(catchUpOf(null, start)).toBeNull();
        expect(catchUpOf({ ...fresh, chats: "done", notes: "done" }, start)).toBeNull();
    });
});
