import { describe, expect, it } from "vitest";
import {
    rowToUIMessage,
    dropUnsignedReasoning,
    dropForeignReasoning,
    compactOldReads,
    COMPACT_EVERY_TURNS,
    recentStart,
    toClientMessage,
    applyApprovals,
    settleUnanswered,
    keepFinishedWrites,
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

    it("coerces an unknown role to 'user'", () => {
        const row = uiMessageToRow(
            { id: "msg_4", role: "tool" },
            { conversationId: "conv_1", userId: "user_1", orderIndex: 2, status: "complete" },
        );

        expect(row.role).toBe("user");
    });
});


describe("dropForeignReasoning", () => {
    // Signed, so dropUnsignedReasoning keeps it — only the model switch removes it.
    const meta = () => ({
        openrouter: { reasoning_details: [{ type: "reasoning.text", format: "google-gemini-v1", text: "t", signature: "sig" }], other: 1 },
    });
    const msg = (model: string | undefined) => ({
        role: "assistant",
        metadata: model === undefined ? {} : { model },
        parts: [{ type: "reasoning", text: "r", providerMetadata: meta() }],
    });
    const details = (m: { parts: unknown[] }) => (m.parts[0] as any).providerMetadata.openrouter.reasoning_details;

    it("drops signed reasoning left by a different model", () => {
        const [out] = dropForeignReasoning([msg("cheap/model")], "std/model");
        expect(details(out)).toEqual([]);
        // Everything else in the provider metadata survives.
        expect((out.parts[0] as any).providerMetadata.openrouter.other).toBe(1);
    });

    it("keeps reasoning the current model produced itself", () => {
        const [out] = dropForeignReasoning([msg("std/model")], "std/model");
        expect(details(out)).toHaveLength(1);
    });

    it("leaves pre-routing history (no recorded model) alone", () => {
        const [out] = dropForeignReasoning([msg(undefined)], "std/model");
        expect(details(out)).toHaveLength(1);
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

    /** `n` user/assistant exchanges, then the new user message. */
    const thread = (n: number) => [...Array.from({ length: n }, () => [turn("user"), turn("assistant")]).flat(), turn("user")];

    it("shrinks older turns' read rows to ids and keeps recent turns whole", () => {
        const messages = thread(COMPACT_EVERY_TURNS + 1);
        const out = compactOldReads(messages);
        const from = recentStart(messages);

        expect(from).toBe(2 * COMPACT_EVERY_TURNS); // the first COMPACT_EVERY_TURNS exchanges compacted
        expect(out[1].parts[0]).toMatchObject({ output: { tasks: { count: 2, ids: ["a", "b"] }, count: 2 } });
        expect(out[1].parts[1]).toBe(proposal);
        expect(out[from + 1].parts[0]).toBe(read);
        expect(out.at(-1)!.parts).toEqual([{ type: "text", text: "hi" }]);
    });

    it("moves the cut only once every few turns, always keeping the previous turn whole", () => {
        const cuts = Array.from({ length: 3 * COMPACT_EVERY_TURNS }, (_, n) => recentStart(thread(n)));
        // Each cut holds for COMPACT_EVERY_TURNS turns in a row, so replayed history only grows between steps.
        expect(new Set(cuts).size).toBe(3);
        cuts.forEach((cut, n) => expect(cut).toBeLessThanOrEqual(Math.max(0, 2 * (n - 1))));
    });

});

describe("turn context", () => {
    const row = (role: "user" | "assistant", metadata: Record<string, unknown>): StoredMessage =>
        ({ id: "m", role, parts: [], metadata, status: "complete", orderIndex: 1 });

    it("stays on the server: the client copy drops it, keeping the rest", () => {
        const stored = row("user", { clientMessageId: "c", turnContext: "CTX" });
        expect(toClientMessage(stored).metadata).toEqual({ clientMessageId: "c" });
        expect(stored.metadata.turnContext).toBe("CTX");
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

describe("keepFinishedWrites", () => {
    const row = (id: string, role: StoredMessage["role"], status: StoredMessage["status"], parts: unknown[]): StoredMessage =>
        ({ id, role, status, parts, metadata: {}, orderIndex: 0 });
    const read = { type: "tool-get_projects", toolCallId: "r", state: "output-available", output: {} };
    const write = { type: "tool-update_tasks", toolCallId: "w", state: "output-available", output: { updated: 1 } };
    const user = row("u", "user", "complete", [{ type: "text", text: "heat" }]);

    it("keeps a failed reply's finished steps and drops its partial text", () => {
        const failed = row("a", "assistant", "failed", [
            { type: "step-start" }, read, { type: "step-start" }, write, { type: "text", text: "Half a sen" },
        ]);
        expect(keepFinishedWrites([user, failed], "u")).toEqual({
            id: "a", role: "assistant", metadata: {},
            parts: [{ type: "step-start" }, read, { type: "step-start" }, write],
        });
    });

    it("starts over when nothing was written, the reply finished, or it isn't the last turn", () => {
        expect(keepFinishedWrites([user, row("a", "assistant", "failed", [read])], "u")).toBeNull();
        expect(keepFinishedWrites([user, row("a", "assistant", "complete", [write])], "u")).toBeNull();
        expect(keepFinishedWrites([user, row("a", "assistant", "failed", [write]), user], "u")).toBeNull();
        expect(keepFinishedWrites([user], "u")).toBeNull();
    });
});
