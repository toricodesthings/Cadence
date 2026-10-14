import type { CacheVariant } from "../../src/domains/ai/agent";

/** Cache probes report observed charges, never prices reconstructed from aggregate writes. */
export interface CacheTrial {
    variant: CacheVariant;
    stage: string;
    repetition?: number;
    costUsd: number | null;
    provider: string | null;
    servedModel: string | null;
    complete: boolean;
}

export function summarizeCacheTrials(trials: CacheTrial[], expectedPerVariant: number) {
    const variants = [...new Set(trials.map((t) => t.variant))];
    return variants.map((variant) => {
        const rows = trials.filter((t) => t.variant === variant);
        const priced = rows.filter((t) => t.costUsd !== null);
        const knownCostUsd = priced.reduce((sum, t) => sum + t.costUsd!, 0);
        const complete = rows.length === expectedPerVariant && new Set(rows.map((t) => `${t.stage}:${t.repetition ?? 0}`)).size === expectedPerVariant
            && rows.every((t) => t.complete && t.costUsd !== null);
        return { variant, calls: rows.length, priced: priced.length, complete,
            knownCostUsd: priced.length ? knownCostUsd : null, exactCostUsd: complete ? knownCostUsd : null,
            strata: rows.map((t) => ({ stage: t.stage, costUsd: t.costUsd })),
            providers: [...new Set(rows.map((t) => t.provider))], servedModels: [...new Set(rows.map((t) => t.servedModel))] };
    });
}

export type CacheStage = "cold" | "warm" | "other-conversation" | "6-minute-return" | "61-minute-return";
export type CacheWeights = Record<CacheStage, number>;
interface ProductionReply {
    at: string;
    user_hash: string;
    conversation_hash: string;
    served_model: string | null;
    prompt_hash: string | null;
    cached?: number | null;
}

/** Observed arrival gaps, not inferred provider hits or reconstructed billing. */
export function productionCacheWeights(rows: ProductionReply[], model: string) {
    const weights: CacheWeights = { cold: 0, warm: 0, "other-conversation": 0, "6-minute-return": 0, "61-minute-return": 0 };
    const previous = new Map<string, number>();
    const conversations = new Set<string>();
    const identities = new Set<string>();
    const users = new Set<string>();
    let otherModels = 0, unknown = 0, initialZeroReadPrefixes = 0;
    const gaps: { stage: CacheStage; gapMs: number | null }[] = [];
    for (const row of [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
        if (!row.served_model) { unknown++; continue; }
        if (row.served_model !== model && !row.served_model.startsWith(`${model}-`)) { otherModels++; continue; }
        const at = Date.parse(row.at);
        if (!row.prompt_hash || !row.conversation_hash || !row.user_hash || !Number.isFinite(at)) { unknown++; continue; }
        const prefix = `${row.served_model}:${row.prompt_hash}`;
        const conversation = `${prefix}:${row.user_hash}:${row.conversation_hash}`;
        const last = previous.get(prefix);
        const gapMs = last === undefined ? null : at - last;
        if (gapMs === null && row.cached === 0) initialZeroReadPrefixes++;
        const stage: CacheStage = gapMs === null ? "cold" : gapMs >= 60 * 60_000 ? "61-minute-return"
            : gapMs >= 5 * 60_000 ? "6-minute-return" : !conversations.has(conversation) ? "other-conversation" : "warm";
        weights[stage]++;
        gaps.push({ stage, gapMs });
        previous.set(prefix, at);
        conversations.add(conversation);
        identities.add(`${row.user_hash}:${row.conversation_hash}`);
        users.add(row.user_hash);
    }
    return { weights, included: gaps.length, unknown, otherModels, firstObservedPrefixes: weights.cold, initialZeroReadPrefixes,
        prefixes: previous.size, conversations: identities.size, conversationPrefixes: conversations.size, users: users.size, gaps };
}

/** Reweight measured stratum charges; this is a synthetic cost index, not a production invoice. */
export function weightedCacheTrials(trials: CacheTrial[], weights: CacheWeights, reference: { variants: readonly CacheVariant[]; provider: string; model: string }) {
    if (Object.values(weights).some((n) => !Number.isSafeInteger(n) || n < 0)) throw new Error("Cache weights must be non-negative integer counts");
    return reference.variants.map((variant) => {
        const strata = Object.entries(weights).filter(([, weight]) => weight > 0).map(([stage, weight]) => {
            const rows = trials.filter((t) => t.variant === variant && t.stage === stage);
            const eligible = rows.filter((t) => t.complete && t.costUsd !== null && Number.isFinite(t.costUsd) && t.costUsd >= 0
                && t.provider === reference.provider && t.servedModel === reference.model);
            const complete = rows.length > 0 && eligible.length === rows.length;
            const costs = eligible.map((r) => r.costUsd!);
            const average = costs.length ? costs.reduce((sum, n) => sum + n, 0) / costs.length : null;
            return { stage, weight, samples: rows.length, eligible: eligible.length, complete,
                meanCostUsd: complete ? average : null,
                minCostUsd: complete ? Math.min(...costs) : null, maxCostUsd: complete ? Math.max(...costs) : null };
        });
        const complete = strata.length > 0 && strata.every((s) => s.complete);
        return { variant, complete, weightedRequests: Object.values(weights).reduce((sum, n) => sum + n, 0), strata,
            weightedCostUsd: complete ? strata.reduce((sum, s) => sum + s.weight * s.meanCostUsd!, 0) : null,
            // Observed extrema sensitivity, not a statistical confidence interval.
            weightedMinUsd: complete ? strata.reduce((sum, s) => sum + s.weight * s.minCostUsd!, 0) : null,
            weightedMaxUsd: complete ? strata.reduce((sum, s) => sum + s.weight * s.maxCostUsd!, 0) : null };
    });
}
