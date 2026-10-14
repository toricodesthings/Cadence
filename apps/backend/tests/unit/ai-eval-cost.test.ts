import { describe, expect, it, vi } from "vitest";
import { evaluationOptions } from "../evals/run-options";
import { createFixtureEmbedder } from "../evals/fixture-embeddings";

describe("paid evaluation run settings", () => {
    it("defaults to one pass and keeps dimension research out of normal validation", () => {
        expect(evaluationOptions({})).toEqual({ profile: "iteration", assistantRuns: 1, memoryRuns: 1, decisionRuns: 1, embeddingDimensions: false });
        expect(evaluationOptions({ AI_EVAL_PROFILE: "full" })).toEqual({ profile: "full", assistantRuns: 3, memoryRuns: 3, decisionRuns: 2, embeddingDimensions: false });
    });
    it("keeps smoke to one pass despite old repeat settings and accepts explicit suite overrides", () => {
        const smoke = evaluationOptions({ AI_EVAL_PROFILE: "smoke", EVAL_RUNS: "3", MEMORY_EVAL_RUNS: "5" });
        expect([smoke.assistantRuns, smoke.memoryRuns, smoke.decisionRuns]).toEqual([1, 1, 1]);
        const targeted = evaluationOptions({ EVAL_RUNS: "2", MEMORY_EVAL_RUNS: "3", AI_EVAL_EMBEDDING_DIMENSIONS: "true" });
        expect([targeted.assistantRuns, targeted.memoryRuns, targeted.decisionRuns]).toEqual([2, 3, 2]);
        expect(targeted.embeddingDimensions).toBe(true);
    });
    it.each(["0", "-1", "1.5", "NaN", "Infinity", "", "9007199254740992"])("rejects invalid repeats (%s) before a paid call", (value) => {
        expect(() => evaluationOptions({ EVAL_RUNS: value })).toThrow("positive integer");
        expect(() => evaluationOptions({ MEMORY_EVAL_RUNS: value })).toThrow("positive integer");
        expect(() => evaluationOptions({ DECISIONS_EVAL_RUNS: value })).toThrow("positive integer");
    });
    it("rejects unknown profiles", () => expect(() => evaluationOptions({ AI_EVAL_PROFILE: "typo" })).toThrow("Invalid AI_EVAL_PROFILE"));
});

describe("synthetic fixture embeddings", () => {
    it("deduplicates concurrent seed batches, preserves order and isolates vectors and configurations", async () => {
        const load = vi.fn(async (texts: string[]) => texts.map((_, index) => [index]));
        const embed = createFixtureEmbedder(load);
        const facts = Array.from({ length: 130 }, (_, index) => `synthetic fact ${index}`);
        const [first, second] = await Promise.all([embed(facts), embed(facts)]);
        expect(load).toHaveBeenCalledTimes(3);
        expect(load.mock.calls.map(([texts]) => texts.length)).toEqual([64, 64, 2]);
        expect(first).toEqual(second);
        first[0][0] = -1;
        expect(second[0][0]).toBe(0);
        expect((await embed(facts))[0][0]).toBe(0);
        await embed(["a different synthetic fact"]);
        expect(load).toHaveBeenCalledTimes(4);
        const otherModel = createFixtureEmbedder(load);
        await otherModel(facts);
        expect(load).toHaveBeenCalledTimes(7);
        expect(await embed([])).toEqual([]);
    });
    it("does not reuse failed or incomplete batches", async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error("provider unavailable"))
            .mockResolvedValueOnce([]).mockResolvedValue([[42]]);
        const embed = createFixtureEmbedder(load);
        await expect(embed(["synthetic fact"])).rejects.toThrow("provider unavailable");
        await expect(embed(["synthetic fact"])).rejects.toThrow("count mismatch");
        expect(await embed(["synthetic fact"])).toEqual([[42]]);
        expect(load).toHaveBeenCalledTimes(3);
    });
});
