import { describe, expect, it } from "vitest";
import {
    rowToUIMessage,
    dropUnsignedReasoning,
    uiMessageToRow,
    type StoredMessage,
} from "../../src/domains/ai/persistence/message-mapper";

describe("rowToUIMessage", () => {
    it("round-trips id/role/parts/metadata and drops status/orderIndex", () => {
        const row: StoredMessage = {
            id: "msg_1",
            role: "assistant",
            parts: [{ type: "text", text: "hello" }],
            metadata: { model: "gpt-test", totalUsage: { tokens: 42 } },
            status: "complete",
            orderIndex: 3,
        };

        const ui = rowToUIMessage(row);

        expect(ui).toEqual({
            id: "msg_1",
            role: "assistant",
            parts: [{ type: "text", text: "hello" }],
            metadata: { model: "gpt-test", totalUsage: { tokens: 42 } },
        });
    });
});

describe("uiMessageToRow", () => {
    it("maps fields and applies ctx", () => {
        const row = uiMessageToRow(
            {
                id: "msg_2",
                role: "user",
                parts: [{ type: "text", text: "hi" }],
                metadata: { ts: 1 },
            },
            { conversationId: "conv_1", userId: "user_1", orderIndex: 5, status: "complete" },
        );

        expect(row).toEqual({
            id: "msg_2",
            conversationId: "conv_1",
            userId: "user_1",
            role: "user",
            parts: [{ type: "text", text: "hi" }],
            metadata: { ts: 1 },
            status: "complete",
            orderIndex: 5,
        });
    });

    it("defaults parts to [] and metadata to {} when missing", () => {
        const row = uiMessageToRow(
            { id: "msg_3", role: "assistant" },
            { conversationId: "conv_1", userId: "user_1", orderIndex: 1, status: "streaming" },
        );

        expect(row.parts).toEqual([]);
        expect(row.metadata).toEqual({});
        expect(row.status).toBe("streaming");
    });

    it("coerces an unknown role to 'user'", () => {
        const row = uiMessageToRow(
            { id: "msg_4", role: "tool" },
            { conversationId: "conv_1", userId: "user_1", orderIndex: 2, status: "complete" },
        );

        expect(row.role).toBe("user");
    });

    it("preserves valid system role", () => {
        const row = uiMessageToRow(
            { id: "msg_5", role: "system" },
            { conversationId: "conv_1", userId: "user_1", orderIndex: 0, status: "complete" },
        );

        expect(row.role).toBe("system");
    });
});


describe("dropUnsignedReasoning", () => {
    const details = [
        { type: "reasoning.text", format: "google-gemini-v1", text: "summary" },
        { type: "reasoning.text", format: "google-gemini-v1", text: "signed", signature: "sig" },
        { type: "reasoning.encrypted", format: "google-gemini-v1", data: "opaque" },
        { type: "reasoning.text", format: "openai-responses-v1", text: "other format" },
        { type: "reasoning.text", text: "no format defaults to anthropic" },
    ];
    const meta = { openrouter: { reasoning_details: details, other: 1 } };

    it("drops only unsigned text details, on reasoning and tool parts alike", () => {
        const [msg] = dropUnsignedReasoning([
            {
                parts: [
                    { type: "reasoning", text: "r", providerMetadata: meta },
                    { type: "tool-get_tasks", callProviderMetadata: meta },
                    { type: "text", text: "hi" },
                ],
            },
        ]);
        const kept = ["signed", undefined, "other format"];
        const [reasoning, tool, text] = msg.parts as Array<Record<string, any>>;
        expect(reasoning.providerMetadata.openrouter.reasoning_details.map((d: any) => d.text)).toEqual(kept);
        expect(tool.callProviderMetadata.openrouter.reasoning_details.map((d: any) => d.text)).toEqual(kept);
        expect(reasoning.providerMetadata.openrouter.other).toBe(1);
        expect(text).toEqual({ type: "text", text: "hi" });
    });
});
