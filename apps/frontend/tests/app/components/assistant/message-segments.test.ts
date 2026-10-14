import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { buildSegments } from "../../../../app/components/assistant/tool-registry";
import { describeThread, imageFilePart, imageIdsOf, messageStatus } from "../../../../app/lib/ai/messages";

describe("assistant message presentation", () => {
    it("keeps stream order while grouping adjacent reads and text around write cards", () => {
        const write = { type: "tool-create_tasks" as const, toolCallId: "write", state: "approval-requested" as const,
            input: {}, approval: { id: "approval-1" } };
        const segments = buildSegments([
            { type: "tool-get_tasks", toolCallId: "r1", state: "output-available", input: {}, output: {} },
            { type: "tool-get_tags", toolCallId: "r2", state: "input-available", input: {} },
            { type: "text", text: "First" }, { type: "text", text: "Second" }, write,
            { type: "tool-get_tasks", toolCallId: "r3", state: "output-error", input: {}, errorText: "Failed" },
        ]);
        expect(segments.map((segment) => segment.kind)).toEqual(["reads", "text", "card", "reads"]);
        expect(segments[0]).toMatchObject({ calls: [{ pending: false }, { pending: true }], pending: true });
        expect(segments[1]).toEqual({ kind: "text", text: "First\n\nSecond" });
        expect(segments[2]).toEqual({ kind: "card", part: write });
        expect(segments[3]).toMatchObject({ calls: [{ failed: true }], pending: false });
    });

    it("retains retired and unknown tool cards, ignoring nonvisual and empty text parts", () => {
        const parts: UIMessage["parts"] = [
            { type: "reasoning", text: "Thinking" }, { type: "step-start" }, { type: "text", text: "" },
            { type: "tool-propose_tasks", toolCallId: "old", state: "output-available", input: {}, output: {} },
            { type: "tool-future_tool", toolCallId: "new", state: "input-streaming" },
        ];
        expect(buildSegments(parts)).toEqual([{ kind: "card", part: parts[3] }, { kind: "card", part: parts[4] }]);
    });

    it("moves receipts from sent to delivered to read, but keeps typing until reply text arrives", () => {
        const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] };
        expect(describeThread([user], "submitted")).toMatchObject({ receiptState: "sent", awaitingReply: true });
        expect(describeThread([user], "streaming")).toMatchObject({ receiptState: "delivered", awaitingReply: true });
        const thinking: UIMessage = { id: "a1", role: "assistant", parts: [{ type: "reasoning", text: "" }] };
        expect(describeThread([user, thinking], "streaming")).toMatchObject({ receiptState: "read", awaitingReply: true });
        thinking.parts.push({ type: "text", text: "Hello there" });
        expect(describeThread([user, thinking], "streaming")).toMatchObject({ receiptState: "read", awaitingReply: false });
        expect(describeThread([user, thinking, { ...user, id: "u2" }], "submitted")).toMatchObject({
            lastUserIndex: 2, lastAssistantIndex: 1, receiptState: "sent", awaitingReply: true,
        });
    });

    it("uses tool activity as evidence of receipt without treating empty text as a reply", () => {
        const messages: UIMessage[] = [
            { id: "u", role: "user", parts: [] },
            { id: "a", role: "assistant", parts: [{ type: "tool-get_tasks", toolCallId: "r", state: "input-streaming" }] },
        ];
        expect(describeThread(messages, "streaming")).toMatchObject({ receiptState: "read", awaitingReply: true });
        expect(describeThread([], "ready")).toMatchObject({ lastUserIndex: -1, lastAssistantIndex: -1, awaitingReply: false });
    });

    it("extracts image references and failed status without assuming metadata shape", () => {
        const message: UIMessage = { id: "u", role: "user", metadata: { status: "failed" }, parts: [
            imageFilePart("11111111-1111-4111-8111-111111111111"), { type: "file", mediaType: "image/png", url: "https://example.com/image.png" },
        ] };
        expect(imageIdsOf(message)).toEqual(["11111111-1111-4111-8111-111111111111"]);
        expect(messageStatus(message)).toBe("failed");
        expect(messageStatus({ ...message, metadata: "invalid" })).toBeUndefined();
    });
});
