import { describe, expect, it, vi } from "vitest";
import { createAgentUIStream, readUIMessageStream, tool, ToolLoopAgent, type UIMessage } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import type { ApprovalMode } from "@cadence/contracts/ai";
import { approvalFor } from "../../src/domains/ai/safety/approval";
import { applyApprovals, settleUnanswered } from "../../src/domains/ai/persistence/message-mapper";

const SECRET = "test-approval-secret";
const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** A model that calls `toolName` once, then answers "Done." once it sees a result. */
function scriptedModel(toolName: string, input: unknown) {
    return new MockLanguageModelV4({
        doStream: async ({ prompt }) => {
            const answered = prompt.some((message) => message.role === "tool");
            const chunks = answered
                ? [
                      { type: "text-start", id: "t" },
                      { type: "text-delta", id: "t", delta: "Done." },
                      { type: "text-end", id: "t" },
                      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
                  ]
                : [
                      { type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(input) },
                      { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
                  ];
            return { stream: convertArrayToReadableStream([{ type: "stream-start", warnings: [] }, ...chunks] as never[]) };
        },
    });
}

async function runTurn(mode: ApprovalMode, messages: UIMessage[], call: { name: string; input: unknown }) {
    const execute = vi.fn(async () => ({ ok: true }));
    const agent = new ToolLoopAgent({
        model: scriptedModel(call.name, call.input),
        tools: { [call.name]: tool({ inputSchema: z.object({ name: z.string() }).passthrough(), execute }) },
        toolApproval: approvalFor(mode),
        experimental_toolApprovalSecret: SECRET,
    });
    const last = messages.at(-1)!;
    const stream = await createAgentUIStream({ agent, uiMessages: messages, originalMessages: messages as never, onError: (e) => String(e) });
    let message: UIMessage | undefined;
    let error: string | undefined;
    for await (const snapshot of readUIMessageStream({
        stream,
        message: last.role === "assistant" ? last : undefined,
        onError: (e) => void (error = String(e)),
    })) {
        message = snapshot;
    }
    return { message: message!, execute, error };
}

const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Make an Errands tag" }] };
const toolPart = (message: UIMessage) => message.parts.find((part) => part.type.startsWith("tool-")) as any;

describe("approval on the server", () => {
    it("Ask stops at a signed approval request, and an approval runs the tool once and continues", async () => {
        const first = await runTurn("ask", [user], { name: "create_tag", input: { name: "Errands" } });
        expect(first.execute).not.toHaveBeenCalled();
        expect(toolPart(first.message)).toMatchObject({ state: "approval-requested", approval: { id: expect.any(String) } });
        expect(toolPart(first.message).approval.signature).toEqual(expect.any(String));

        const answered = applyApprovals(first.message as never, [{ id: toolPart(first.message).approval.id, approved: true }])!;
        const second = await runTurn("ask", [user, answered as UIMessage], { name: "create_tag", input: { name: "Errands" } });

        expect(second.execute).toHaveBeenCalledTimes(1);
        expect(toolPart(second.message)).toMatchObject({ state: "output-available", output: { ok: true } });
        expect(second.message.parts.at(-1)).toMatchObject({ type: "text", text: "Done." });
    });

    it("refuses an approval whose input was changed after signing, and runs nothing", async () => {
        const first = await runTurn("ask", [user], { name: "create_tag", input: { name: "Errands" } });
        const part = toolPart(first.message);
        const forged = { ...first.message, parts: [{ ...part, input: { name: "Everything" } }] } as UIMessage;
        const answered = applyApprovals(forged as never, [{ id: part.approval.id, approved: true }])!;

        const second = await runTurn("ask", [user, answered as UIMessage], { name: "create_tag", input: { name: "Errands" } });

        expect(second.execute).not.toHaveBeenCalled();
        expect(second.error).toMatch(/signature/i);
    });

    it("a decline reaches the model as denied and runs nothing", async () => {
        const first = await runTurn("ask", [user], { name: "create_tag", input: { name: "Errands" } });
        const answered = applyApprovals(first.message as never, [{ id: toolPart(first.message).approval.id, approved: false, reason: "user removed it" }])!;

        const second = await runTurn("ask", [user, answered as UIMessage], { name: "create_tag", input: { name: "Errands" } });

        expect(second.execute).not.toHaveBeenCalled();
        expect(toolPart(second.message).state).toBe("output-denied");
    });

    it.each([
        ["auto", "create_tag", { name: "Errands" }, true],
        ["auto", "delete_tasks", { name: "x", tasks: [{ taskId: "t", title: "x" }] }, false],
        ["full", "delete_tasks", { name: "x", tasks: [{ taskId: "t", title: "x" }] }, true],
    ] as const)("%s runs %s without waiting: %s", async (mode, name, input, runs) => {
        const { execute, message } = await runTurn(mode, [user], { name, input });

        expect(execute).toHaveBeenCalledTimes(runs ? 1 : 0);
        expect(toolPart(message).state).toBe(runs ? "output-available" : "approval-requested");
    });

    it("an approval left unanswered when the user moves on replays as declined", async () => {
        const first = await runTurn("ask", [user], { name: "create_tag", input: { name: "Errands" } });
        const next: UIMessage = { id: "u2", role: "user", parts: [{ type: "text", text: "Never mind" }] };

        const second = await runTurn("ask", [user, ...settleUnanswered([first.message]), next], { name: "create_tag", input: { name: "Errands" } });

        expect(second.execute).not.toHaveBeenCalled();
        expect(second.message.parts.at(-1)).toMatchObject({ type: "text", text: "Done." });
    });
});
