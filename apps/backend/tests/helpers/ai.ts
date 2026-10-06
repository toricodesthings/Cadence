/**
 * Scripted AI SDK models for tests (`ai/test` mocks, no provider calls). Each mock
 * records what it was sent in `doStreamCalls` / `doGenerateCalls` / `doEmbedCalls`.
 */
import { ToolLoopAgent, type ToolSet } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

export const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
};

export const finish = (reason: "stop" | "tool-calls" = "stop") => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage });

export const textChunks = (text: string) => [
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
];

/** A `doStream` result from model stream parts (the leading `stream-start` is added). */
export const streamOf = (...chunks: unknown[]) => ({
    stream: convertArrayToReadableStream([{ type: "stream-start", warnings: [] }, ...chunks] as never[]),
});

/** A model that answers `text` and stops. */
export const textModel = (text = "Done.") => new MockLanguageModelV4({ doStream: async () => streamOf(...textChunks(text), finish()) });

/** What a mocked `getAgentInstance` resolves to: a real ToolLoopAgent over `model`. */
export const agentOf = (model: MockLanguageModelV4, opts: { tools?: ToolSet; turnContext?: string } = {}) => ({
    agent: new ToolLoopAgent({ model, tools: opts.tools ?? {} }) as never,
    modelId: "unused",
    promptHash: "hash",
    turnContext: opts.turnContext ?? "",
});
