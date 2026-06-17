import { describe, expect, it } from "vitest";
import {
    nextOrderIndex,
    rowToUIMessage,
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
        // Persistence-only fields must not leak into the UIMessage.
        expect(ui).not.toHaveProperty("status");
        expect(ui).not.toHaveProperty("orderIndex");
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

describe("nextOrderIndex", () => {
    it("increments from null", () => {
        expect(nextOrderIndex(null)).toBe(1);
    });

    it("increments from a value", () => {
        expect(nextOrderIndex(5)).toBe(6);
        expect(nextOrderIndex(0)).toBe(1);
    });
});
