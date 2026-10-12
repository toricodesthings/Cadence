import { describe, expect, it } from "vitest";
import { durationReportSchema, FULL_ONLY_KINDS, memoryFactSchema, memoryPageSchema, setMemoryModeSchema } from "@cadence/contracts/memory";
import { TOOL_CATALOG, isMemoryTool } from "@cadence/contracts/ai-tools";

describe("memory contracts", () => {
    it("takes only the three modes, with the wording version the person agreed to", () => {
        expect(setMemoryModeSchema.parse({ mode: "full", consentVersion: "2026-10-12" })).toEqual({ mode: "full", consentVersion: "2026-10-12" });
        expect(setMemoryModeSchema.safeParse({ mode: "everything", consentVersion: "x" }).success).toBe(false);
        expect(setMemoryModeSchema.safeParse({ mode: "basic" }).success).toBe(false);
    });

    it("bounds a duration report to a day", () => {
        const taskId = crypto.randomUUID();
        expect(durationReportSchema.safeParse({ taskId, minutes: 45 }).success).toBe(true);
        expect(durationReportSchema.safeParse({ taskId, minutes: 0 }).success).toBe(false);
        expect(durationReportSchema.safeParse({ taskId, minutes: 1441 }).success).toBe(false);
        expect(durationReportSchema.safeParse({ taskId, minutes: 12.5 }).success).toBe(false);
    });

    it("keeps a fact's text short and its dates plain days", () => {
        const fact = { id: crypto.randomUUID(), kind: "life", content: "Wedding is June 14, 2027", saidOn: "2026-08-12", lastSeenOn: "2026-08-12", seenCount: 1, validThrough: null, source: "chat", confidence: "stated", sensitive: false, pinned: false, conversationId: null };
        expect(memoryFactSchema.safeParse(fact).success).toBe(true);
        expect(memoryFactSchema.safeParse({ ...fact, content: "x".repeat(301) }).success).toBe(false);
        expect(memoryFactSchema.safeParse({ ...fact, saidOn: "2026-08-12T00:00:00Z" }).success).toBe(false);
        expect(memoryPageSchema.safeParse({ mode: null, choiceAt: null, inactive: true, catchUp: null, facts: [], forgotten: [] }).success).toBe(true);
    });

    it("names the activity kinds only Full learns, and the three tools that exist only with memory on", () => {
        expect(FULL_ONLY_KINDS).toEqual(["pattern", "duration"]);
        expect(Object.keys(TOOL_CATALOG).filter(isMemoryTool).sort()).toEqual(["recall", "remember", "search_past_chats"]);
    });
});
