import { describe, expect, it } from "vitest";
import {
    chatImageUrl,
    chatRequestSchema,
    parseChatImageUrl,
    conversationPatchSchema,
    MAX_PARTS_PER_MESSAGE,
    stopStreamSchema,
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

    it("takes approval answers instead of a message, for a known thread", () => {
        const conversationId = "22222222-2222-4222-8222-222222222222";
        const approvals = [{ id: "a1", approved: false, reason: "user removed Buy milk" }];
        const answer = { conversationId, approvals, currentDate: "2026-09-23T12:00:00.000Z" };
        expect(chatRequestSchema.safeParse(answer).success).toBe(true);
        expect(chatRequestSchema.safeParse({ ...answer, conversationId: undefined }).success).toBe(false);
        expect(chatRequestSchema.safeParse({ ...answer, message: { id: "m1", role: "user", parts: [text("hi")] } }).success).toBe(false);
        expect(chatRequestSchema.safeParse({ conversationId, currentDate: answer.currentDate }).success).toBe(false);
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


describe("chat image urls", () => {
    const id = "0b9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b";
    it("round-trips an id and rejects anything else", () => {
        expect(parseChatImageUrl(chatImageUrl(id))).toBe(id);
        expect(parseChatImageUrl(`https://example.com/${id}.webp`)).toBeNull();
        expect(parseChatImageUrl("data:image/webp;base64,AAAA")).toBeNull();
        expect(parseChatImageUrl("cadence-image:../../etc")).toBeNull();
        expect(parseChatImageUrl(undefined)).toBeNull();
    });
});
