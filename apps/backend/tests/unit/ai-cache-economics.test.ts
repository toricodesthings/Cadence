import { describe, expect, it } from "vitest";
import { productionCacheWeights, summarizeCacheTrials, weightedCacheTrials, type CacheTrial, type CacheWeights } from "../evals/cache-economics";

const trial = (stage: string, costUsd: number | null, complete = true): CacheTrial => ({ variant: "1h-5m", stage, costUsd, complete, provider: "Anthropic", servedModel: "configured" });

describe("cache experiment accounting", () => {
    it("includes cold premiums and returns only the exact cost of the observed corpus", () => {
        const [r] = summarizeCacheTrials([trial("cold", 0.004), trial("warm", 0.0002), trial("6-minute-return", 0.0003)], 3);
        expect(r).toMatchObject({ complete: true, calls: 3, priced: 3, exactCostUsd: 0.0045 });
        expect(r.strata[0]).toEqual({ stage: "cold", costUsd: 0.004 });
    });
    it("does not turn missing prices, failed attempts or an interrupted experiment into a complete total", () => {
        for (const rows of [[trial("cold", 0.004)], [trial("cold", 0.004), trial("warm", null)], [trial("cold", 0.004), trial("warm", 0.001, false)], [trial("cold", 0.004), trial("cold", 0.004)]]) {
            expect(summarizeCacheTrials(rows, 2)[0]).toMatchObject({ complete: false, exactCostUsd: null });
        }
        expect(summarizeCacheTrials([trial("cold", null)], 1)[0].knownCostUsd).toBeNull();
    });
    it("keeps provider/model mismatches visible and never mixes variants", () => {
        const rows = [trial("cold", 0.004), { ...trial("warm", 0.001), provider: "fallback", servedModel: "other" }, { ...trial("cold", 0.003), variant: "5m-5m" as const }];
        const [candidate, baseline] = summarizeCacheTrials(rows, 2);
        expect(candidate.providers).toEqual(["Anthropic", "fallback"]);
        expect(candidate.servedModels).toEqual(["configured", "other"]);
        expect(baseline).toMatchObject({ calls: 1, exactCostUsd: null, knownCostUsd: 0.003 });
    });
});

describe("production gap weighting", () => {
    const row = (minute: number, conversation = "a", hash: string | null = "prefix", user = "user") => ({
        at: new Date(Date.UTC(2026, 9, 13, 12, minute)).toISOString(), conversation_hash: conversation, prompt_hash: hash,
        user_hash: user, served_model: "anthropic/configured",
    });
    it("uses shared-prefix gaps across conversations/users and resets for a new prompt fingerprint", () => {
        const result = productionCacheWeights([row(0), row(1), row(2, "b", "prefix", "other"), row(8), row(69), row(70, "a", "new")], "anthropic/configured");
        expect(result.weights).toEqual({ cold: 2, warm: 1, "other-conversation": 1, "6-minute-return": 1, "61-minute-return": 1 });
        expect(result).toMatchObject({ included: 6, prefixes: 2, conversations: 3, unknown: 0 });
    });
    it("does not turn missing identity/timing/model into cold requests or mix unrelated models", () => {
        const result = productionCacheWeights([row(0, "a", null), { ...row(1), at: "invalid" }, { ...row(2), served_model: null },
            { ...row(3), served_model: "different/model" }], "anthropic/configured");
        expect(result).toMatchObject({ included: 0, unknown: 3, otherModels: 1 });
    });
    it("uses exact expiry boundaries and handles unordered input", () => {
        expect(productionCacheWeights([row(65), row(0), row(5)], "anthropic/configured").weights)
            .toEqual({ cold: 1, warm: 0, "other-conversation": 0, "6-minute-return": 1, "61-minute-return": 1 });
    });
});

describe("weighted observed cache charges", () => {
    const weights: CacheWeights = { cold: 2, warm: 8, "other-conversation": 0, "6-minute-return": 1, "61-minute-return": 0 };
    const reference = { variants: ["1h-5m"] as const, provider: "Anthropic", model: "configured" };
    const rows = [trial("cold", 0.004), trial("cold", 0.006), trial("warm", 0.0002), trial("6-minute-return", 0.0003)];
    it("weights cold premiums by observed frequency rather than equally weighting controls", () => {
        const [r] = weightedCacheTrials(rows, weights, reference);
        expect(r).toMatchObject({ complete: true, weightedRequests: 11 });
        expect(r.weightedCostUsd).toBeCloseTo(0.0119);
        expect(r.weightedMinUsd).toBeCloseTo(0.0099);
        expect(r.weightedMaxUsd).toBeCloseTo(0.0139);
    });
    it("requires every nonzero stratum and rejects route mismatches, unknown costs and failures", () => {
        for (const data of [rows.slice(0, -1), [...rows, trial("warm", null)], [...rows, trial("warm", 0.1, false)],
            [...rows, { ...trial("warm", 0.001), provider: "fallback" }], [...rows, { ...trial("cold", 0.001), servedModel: "other" }]]) {
            expect(weightedCacheTrials(data, weights, reference)[0]).toMatchObject({ complete: false, weightedCostUsd: null });
        }
        expect(() => weightedCacheTrials(rows, { ...weights, cold: -1 }, reference)).toThrow("non-negative integer");
    });
});
