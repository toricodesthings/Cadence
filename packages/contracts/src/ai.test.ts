import { describe, expect, it } from "vitest";
import {
    chatRequestSchema,
    conversationPatchSchema,
    MAX_PARTS_PER_MESSAGE,
    stopStreamSchema,
    toolOutputRequestSchema,
    uiMessageSchema,
} from "./ai";

const text = (t: string) => ({ type: "text", text: t });
const chat = (message: Record<string, unknown>) => ({ message, currentDate: "2026-06-05T09:00:00.000Z" });

describe("chatRequestSchema", () => {
    it("accepts a user turn and defaults the timezone to UTC", () => {
        const parsed = chatRequestSchema.parse(chat({ id: "m1", role: "user", parts: [text("hi")] }));
        expect(parsed.timezone).toBe("UTC");
    });

    // Security: a crafted request must never persist an elevated role into history.
    it.each(["assistant", "system"])("rejects an incoming %s turn", (role) => {
        expect(chatRequestSchema.safeParse(chat({ id: "m1", role, parts: [text("hi")] })).success).toBe(false);
    });

    it("accepts editAnchorId null (first message edited) or an id, and omits it otherwise", () => {
        const base = chat({ id: "m1", role: "user", parts: [] });
        expect(chatRequestSchema.safeParse({ ...base, editAnchorId: null }).success).toBe(true);
        expect(chatRequestSchema.safeParse({ ...base, editAnchorId: "m0" }).success).toBe(true);
        expect(chatRequestSchema.parse(base)).not.toHaveProperty("editAnchorId");
    });
});

describe("uiMessageSchema", () => {
    it("defaults parts to [] and passes unknown part fields through", () => {
        expect(uiMessageSchema.parse({ id: "m1", role: "assistant" }).parts).toEqual([]);
        expect(uiMessageSchema.parse({ id: "m1", role: "assistant", parts: [{ type: "tool-x", input: { a: 1 } }] }).parts).toEqual([
            { type: "tool-x", input: { a: 1 } },
        ]);
    });

    it(`caps a message at ${MAX_PARTS_PER_MESSAGE} parts`, () => {
        const parts = (n: number) => Array.from({ length: n }, () => text("x"));
        expect(uiMessageSchema.safeParse({ id: "m1", role: "user", parts: parts(MAX_PARTS_PER_MESSAGE) }).success).toBe(true);
        expect(uiMessageSchema.safeParse({ id: "m1", role: "user", parts: parts(MAX_PARTS_PER_MESSAGE + 1) }).success).toBe(false);
    });

    it("rejects a part with no type", () => {
        expect(uiMessageSchema.safeParse({ id: "m1", role: "user", parts: [{ text: "hi" }] }).success).toBe(false);
    });
});

describe("stopStreamSchema", () => {
    it("only accepts an assistant snapshot", () => {
        expect(stopStreamSchema.safeParse({ assistantMessage: { id: "a1", role: "assistant", parts: [] } }).success).toBe(true);
        expect(stopStreamSchema.safeParse({ assistantMessage: { id: "a1", role: "user", parts: [] } }).success).toBe(false);
    });
});

describe("conversationPatchSchema", () => {
    it.each([
        [{ title: "Plan" }, true],
        [{ archived: true }, true],
        [{}, false], // must change something
        [{ title: "x".repeat(201) }, false],
    ])("%j → %s", (patch, ok) => {
        expect(conversationPatchSchema.safeParse(patch).success).toBe(ok);
    });
});

describe("toolOutputRequestSchema", () => {
    it("requires a toolCallId and an object output", () => {
        expect(toolOutputRequestSchema.safeParse({ toolCallId: "c1", output: { decision: "commit" } }).success).toBe(true);
        expect(toolOutputRequestSchema.safeParse({ output: { decision: "commit" } }).success).toBe(false);
        expect(toolOutputRequestSchema.safeParse({ toolCallId: "c1", output: "commit" }).success).toBe(false);
    });
});
