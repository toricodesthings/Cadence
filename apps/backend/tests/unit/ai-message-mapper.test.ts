import { describe, expect, it } from "vitest";
import {
    rowToUIMessage,
    dropUnsignedReasoning,
    compactOldReads,
    applyApprovals,
    settleUnanswered,
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

describe("compactOldReads", () => {
    const read = { type: "tool-get_tasks", state: "output-available", output: { tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }], count: 2 } };
    const proposal = { type: "tool-propose_create_task", state: "input-available", input: { title: "X" } };
    const turn = (role: string) => ({ role, parts: role === "assistant" ? [read, proposal] : [{ type: "text", text: "hi" }] });

    it("shrinks older turns' read rows to ids and keeps the latest assistant turn whole", () => {
        const [older, , latest, user] = compactOldReads([turn("assistant"), turn("user"), turn("assistant"), turn("user")]);

        expect(older.parts[0]).toMatchObject({ output: { tasks: { count: 2, ids: ["a", "b"] }, count: 2 } });
        expect(older.parts[1]).toBe(proposal);
        expect(latest.parts[0]).toBe(read);
        expect(user.parts).toEqual([{ type: "text", text: "hi" }]);
    });
});

describe("approval answers", () => {
    const waiting = { type: "tool-create_tag", toolCallId: "c1", state: "approval-requested", input: { name: "x" }, approval: { id: "ap1", signature: "sig" } };
    const done = { type: "tool-create_tag", toolCallId: "c0", state: "output-available", input: { name: "y" }, output: { tagId: "t" } };
    const reply = { id: "a1", role: "assistant" as const, parts: [done, waiting], metadata: {} };

    it("answer only a waiting part, keeping the server's approval id and signature", () => {
        const answered = applyApprovals(reply, [{ id: "ap1", approved: false, reason: "no" }, { id: "c0", approved: true }])!;

        expect(answered.parts).toEqual([done, { ...waiting, state: "approval-responded", approval: { id: "ap1", signature: "sig", approved: false, reason: "no" } }]);
    });

    it("are refused when nothing on the reply waits for them", () => {
        expect(applyApprovals(reply, [{ id: "other", approved: true }])).toBeNull();
    });

    it("left unanswered replay as declined, and half-streamed calls are dropped", () => {
        const streaming = { type: "tool-create_tag", toolCallId: "c2", state: "input-streaming", input: {} };
        const legacy = { type: "tool-propose_create_task", toolCallId: "c3", state: "input-available", input: { title: "X" } };
        const [settled] = settleUnanswered([{ ...reply, parts: [done, waiting, streaming, legacy] }]);

        expect(settled.parts).toEqual([
            done,
            { ...waiting, state: "output-denied", approval: { id: "ap1", signature: "sig", approved: false, reason: "Not answered" } },
            { ...legacy, state: "output-denied", approval: { id: "unanswered-c3", approved: false, reason: "Not answered" } },
        ]);
    });
});
