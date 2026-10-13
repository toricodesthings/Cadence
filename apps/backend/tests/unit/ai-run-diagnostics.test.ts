import { describe, expect, it } from "vitest";
import { ToolLoopAgent, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { createRunDiagnostics } from "../../src/domains/ai/run-diagnostics";
import { finish, streamOf, textChunks } from "../helpers/ai";

describe("run diagnostics", () => {
    it("keeps overlapping phase offsets and closes failed phases without swallowing errors", async () => {
        let ms = 1;
        const run = createRunDiagnostics(() => ms);
        const end = run.beginPhase("profile");
        ms = 4;
        const endEmbedding = run.beginPhase("embedding");
        ms = 9;
        end();
        end();
        ms = 12;
        endEmbedding();
        await expect(run.measure("recall", async () => { ms = 15; throw new Error("private"); })).rejects.toThrow("private");
        expect(run.snapshot().phases).toEqual([
            { name: "profile", startMs: 1, endMs: 9 },
            { name: "embedding", startMs: 4, endMs: 12 },
            { name: "recall", startMs: 12, endMs: 15 },
        ]);
        expect(JSON.stringify(run.snapshot())).not.toContain("private");
    });

    it("records actual model usage separately from tools without copying content or provider metadata", async () => {
        let ms = 0;
        const run = createRunDiagnostics(() => ++ms);
        const model = new MockLanguageModelV4({
            doStream: async ({ prompt }) => {
                const answered = prompt.some((message) => message.role === "tool");
                return streamOf(
                    { type: "response-metadata", id: answered ? "gen-2" : "gen-1", modelId: "served/model" },
                    ...(answered ? textChunks("private answer") : [{ type: "tool-call", toolCallId: "call-1", toolName: "read", input: '{"text":"private input"}' }]),
                    {
                        ...finish(answered ? "stop" : "tool-calls"),
                        usage: { inputTokens: { total: 120, noCache: 10, cacheRead: 100, cacheWrite: 10 }, outputTokens: { total: 12, text: 5, reasoning: 7 } },
                        providerMetadata: { openrouter: { usage: { cost: 0.01 }, reasoning: "private reasoning", files: ["private file"] } },
                    },
                );
            },
        });
        const agent = new ToolLoopAgent({
            model, ...run.hooks, stopWhen: isStepCount(3),
            tools: { read: tool({ inputSchema: z.object({ text: z.string() }), execute: async () => ({ text: "private output" }) }) },
        });
        const result = await agent.stream({ prompt: "private question" });
        await result.consumeStream();
        const record = run.snapshot();
        expect(record.modelCalls).toHaveLength(2);
        expect(record.exactCostUsd).toBe(0.02);
        expect(record.modelCalls[0]).toMatchObject({ ordinal: 0, step: 0, generationId: "gen-1", servedModel: "served/model", costUsd: 0.01,
            usage: { inputTokens: 120, ordinaryInputTokens: 10, cacheReadTokens: 100, cacheWriteTokens: 10, outputTokens: 12, reasoningTokens: 7 } });
        expect(record.steps.map((step) => step.toolCalls)).toEqual([1, 0]);
        expect(record.tools).toEqual([expect.objectContaining({ step: 0, name: "read", outcome: "complete", endMs: expect.any(Number) })]);
        expect(record.generationEndMs).toEqual(expect.any(Number));
        expect(record.steps[0]!.endMs).toBeGreaterThan(record.modelCalls[0]!.endMs!);
        expect(JSON.stringify(record)).not.toContain("private");
    });

    it("keeps failed attempts unknown and observes retries without changing the SDK retry policy", async () => {
        const { APICallError } = await import("ai");
        let attempts = 0;
        const run = createRunDiagnostics(() => 1);
        const model = new MockLanguageModelV4({
            doStream: async () => {
                if (++attempts === 1) throw new APICallError({ message: "private", url: "https://example.com", requestBodyValues: {}, statusCode: 503, isRetryable: true });
                return streamOf(...textChunks("ok"), { ...finish(), providerMetadata: { openrouter: { usage: { cost: 0.01 } } } });
            },
        });
        const result = await new ToolLoopAgent({ model, ...run.hooks }).stream({ prompt: "private" });
        await result.consumeStream();
        const record = run.snapshot();
        expect(attempts).toBe(2);
        expect(record.modelCalls).toHaveLength(2);
        expect(record.steps).toHaveLength(1);
        expect(record.modelCalls[0]).toMatchObject({ usage: null, costUsd: null });
        expect(record.modelCalls[0]!.endMs).toBeUndefined();
        expect(record.modelCalls[1]!.costUsd).toBe(0.01);
        expect(record.exactCostUsd).toBeNull();
    });

    it("does not report an absent or invalid charge as zero", async () => {
        for (const cost of [undefined, -1, NaN, Infinity, "0.01", 0]) {
            const run = createRunDiagnostics(() => 1);
            const model = new MockLanguageModelV4({ doStream: async () => streamOf(...textChunks("ok"), {
                ...finish(), providerMetadata: { openrouter: { usage: { cost } } },
            }) });
            const result = await new ToolLoopAgent({ model, ...run.hooks }).stream({ prompt: "hi" });
            await result.consumeStream();
            expect(run.snapshot().exactCostUsd).toBe(cost === 0 ? 0 : null);
        }
    });

    it("bounds observations and gives separate requests distinct run IDs", () => {
        const run = createRunDiagnostics(() => 1);
        for (let i = 0; i < 100; i++) run.beginPhase("snapshot")();
        expect(run.snapshot().phases).toHaveLength(64);
        expect(run.snapshot().droppedEntries).toBe(36);
        expect(run.runId).not.toBe(createRunDiagnostics(() => 1).runId);
    });
});
