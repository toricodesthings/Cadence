import { ToolLoopAgent, type ToolSet } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

export const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
};

export const finish = (reason: "stop" | "tool-calls" = "stop") => ({
    type: "finish",
    finishReason: { unified: reason, raw: reason },
    usage,
});

export const textChunks = (text: string) => [
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
];

export const streamOf = (...chunks: unknown[]) => ({
    stream: convertArrayToReadableStream([{ type: "stream-start", warnings: [] }, ...chunks] as never[]),
});

export const textModel = (text = "Done.") =>
    new MockLanguageModelV4({ doStream: async () => streamOf(...textChunks(text), finish()) });

export const agentOf = (model: MockLanguageModelV4, opts: { tools?: ToolSet; turnContext?: string } = {}) => ({
    agent: new ToolLoopAgent({ model, tools: opts.tools ?? {} }) as never,
    modelId: "unused",
    promptHash: "hash",
    turnContext: opts.turnContext ?? "",
});
