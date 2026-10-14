/** Read-only generation reconciliation + observed-gap weighting. Never calls a model or changes runtime configuration. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { productionCacheWeights, weightedCacheTrials } from "../tests/evals/cache-economics.ts";

const [matchedId, probeId] = process.argv.slice(2);
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;
if (!uuid.test(matchedId ?? "") || !uuid.test(probeId ?? "")) throw new Error("Usage: eval:cache:report <matched UUID> <initial probe UUID>");
try { process.loadEnvFile(fileURLToPath(new URL("../.dev.vars", import.meta.url))); } catch { /* exported key also works */ }
const directory = fileURLToPath(new URL("../../../output/evals/", import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(directory, name), "utf8"));
const finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
const sources = [matchedId, probeId].map((id) => ({ id, document: load(`cache-${id}.json`) }));
if (sources[0].document.profile !== "matched") throw new Error("The first source must be a matched cache experiment");
if (sources[0].document.modelId !== sources[1].document.modelId) throw new Error("Experiments requested different models");
const expiryName = `cache-${probeId}-expiry.json`;
const expiry = existsSync(join(directory, expiryName)) ? load(expiryName) : { rows: [] };
const reconciled = new Map();

for (const source of sources) {
    const name = `cache-${source.id}-generation-verification.json`;
    const cached = existsSync(join(directory, name)) ? load(name).rows : [];
    const byId = new Map(cached.map((r) => [r.generationId, r]));
    const rows = [...source.document.observations, ...(source.document.controls ?? []), ...(source.id === probeId ? expiry.rows : [])];
    const missing = rows.filter((r) => r.generationId && !byId.has(r.generationId));
    if (missing.length && !process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for read-only generation metadata");
    for (let i = 0; i < missing.length; i += 3) await Promise.all(missing.slice(i, i + 3).map(async (row) => {
        const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(row.generationId)}`, {
            headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }, signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`Generation metadata lookup returned ${response.status}`);
        const { data } = await response.json();
        byId.set(row.generationId, { generationId: row.generationId, status: response.status, provider: data?.provider_name ?? null,
            model: data?.model ?? null, costUsd: data?.total_cost ?? null, cached: data?.native_tokens_cached ?? null });
    }));
    const verified = rows.map((row, index) => {
        const generation = byId.get(row.generationId);
        const matches = finite(row.costUsd) && finite(generation?.costUsd) && Math.abs(row.costUsd - generation.costUsd) < 1e-12;
        const trial = { ...row, stage: row.stage ?? "61-minute-return", sdkCostUsd: finite(row.costUsd) ? row.costUsd : null, costUsd: matches ? row.costUsd : null,
            provider: generation?.provider ?? null, servedModel: generation?.model ?? null, reconciles: matches };
        reconciled.set(row.generationId ?? `${source.id}:${index}`, trial);
        return generation ?? { generationId: row.generationId, status: null, provider: null, model: null, costUsd: null };
    });
    writeFileSync(join(directory, name), JSON.stringify({ source: `cache-${source.id}.json`, expirySource: source.id === probeId ? expiryName : null,
        evidence: "read-only OpenRouter generation metadata; no new model calls; original probe unchanged", at: new Date().toISOString(), rows: verified }, null, 2));
}

const trials = [...reconciled.values()];
const first = trials.find((r) => r.variant === "5m-5m" && r.stage === "cold");
if (!first?.servedModel || first.provider !== "Anthropic") throw new Error("No reconciled Anthropic baseline model");
const variants = [...new Set(sources.flatMap((s) => s.document.observations.map((r) => r.variant)))];
const reference = { variants, provider: "Anthropic", model: first.servedModel };
const production = load("p3-production-gaps.json");
const history = productionCacheWeights(production.rows, sources[0].document.modelId);
const comparison = weightedCacheTrials(trials, history.weights, reference);
const baseline = comparison.find((r) => r.variant === "5m-5m");
const sensitivity = Array.from({ length: history.firstObservedPrefixes + 1 }, (_, cold) => ({
    firstObservedCountedCold: cold,
    comparison: weightedCacheTrials(trials, { ...history.weights, cold, warm: history.weights.warm + history.firstObservedPrefixes - cold }, reference),
}));
const complete = comparison.every((r) => r.complete);
const cheaper = complete ? comparison.filter((r) => r.weightedCostUsd < baseline.weightedCostUsd).map((r) => r.variant) : [];
const report = { at: new Date().toISOString(), evidence: "observed-gap-weighted synthetic request cost index; not a production invoice or browser latency measurement",
    sources: { matchedId, probeId, production: "p3-production-gaps.json", expiry: expiryName },
    history: { ...history, from: production.from, to: production.to, users: new Set(production.rows.map((r) => r.user_hash)).size },
    reference, complete, comparison, sensitivity,
    conclusion: !complete ? "incomplete-strata-retain-baseline" : cheaper.length ? "cheaper-candidates-need-latency-acceptance" : "retain-5m-5m",
    cheaper, rawKnownSpendUsd: trials.some((r) => r.sdkCostUsd !== null) ? trials.reduce((sum, r) => sum + (r.sdkCostUsd ?? 0), 0) : null,
    unknownSdkCostCalls: trials.filter((r) => r.sdkCostUsd === null).length, unknownReconciliations: trials.filter((r) => !r.reconciles).length,
    limitations: ["One user's retained reply chronology; continuations/deleted messages can be missing or overwritten",
        "First observed prompt fingerprint is a cold-start assumption; all cold/warm alternatives are reported",
        "Prompt hashes can change without changing all effective prefix bytes", "Synthetic costs reweighted by observed arrivals; not reconstructed bills",
        "Repeated short-generation probes establish cache mechanics/prices, not production task or browser latency parity",
        "No live outage induced; same-route weighting rejects fallback models/providers instead of mixing their prices"],
};
writeFileSync(join(directory, "p3-cache-decision.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ complete, conclusion: report.conclusion, includedReplies: history.included, weights: history.weights,
    weightedCosts: comparison.map((r) => ({ variant: r.variant, usd: r.weightedCostUsd })), knownModelSpendUsd: report.rawKnownSpendUsd }));
