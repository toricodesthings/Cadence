/**
 * Decision adapter: one `choice` question to an OpenRouter decision model.
 *
 * A decision model returns probabilities over options the app supplies, never text, so it can only
 * pick among the user's real ids. This NEVER throws: no model, a timeout, an error or
 * a low probability all resolve to "no choice" and the caller shows today's screen.
 *
 * Nothing user-written is logged: the `ai_decision` line carries only kind, model, tokens, cost, ms and outcome.
 */
import { eq } from "drizzle-orm";
import { users } from "../../db/schema";
import { withinDailyBudget } from "../../platform/daily-budget";
import { logger } from "../../platform/log";
import type { Tx } from "../../types/db";
import type { Env } from "../../types/env";

export type DecisionKind = "placement" | "search" | "assistant_search";
export type DecisionOutcome = "chose" | "abstained" | "below_threshold" | "timeout" | "error";

/** Shown only when the top option's probability is at least this. Used for a model with no entry below. */
const UNCALIBRATED_THRESHOLD = 0.9;

/**
 * Thresholds per pinned model ID and kind, filled in from the evaluation (tests/evals/decisions.eval.ts).
 * A model with no entry is "uncalibrated" and uses the conservative fallback.
 */
export const DECISION_THRESHOLDS: Record<string, Partial<Record<DecisionKind, number>>> = {
    // 2026-10 eval: placement 90% coverage / 3% wrong; search 95% / 0%; nothing shown when nothing fits.
    "microsoft/microsoft-decision-1-20261009": { placement: 0.5, search: 0.6, assistant_search: 0.6 },
};

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MAX_OPTIONS = 255;
const TIMEOUT_MS = 6_000;
/** Model decisions per person per day, all kinds together. Past it the app shows today's screen without the suggestion. */
export const DAILY_DECISIONS = 200;

export function decisionModel(env: Env): string | null {
    if (!env.OPENROUTER_API_KEY) return null;
    return env.AI_DECISION_MODEL?.trim() || null;
}

/** The switch in Settings › Intelligence & Privacy: on unless it is exactly `false`. */
export async function smartPlacementOn(tx: Tx, userId: string): Promise<boolean> {
    const [user] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    return user?.settings?.tasks?.intelligence?.smartPlacement !== false;
}

export interface DecisionCandidate {
    id: string;
    /** What the model reads for this option. Short. */
    label: string;
}

export interface DecisionResult {
    /** The chosen candidate's id; null when the model abstained or fell short of the threshold. */
    id: string | null;
    /** The option the model liked best even when it fell short of the threshold (null when "none" won). For calibration. */
    top?: string | null;
    probability: number;
    model: string;
    costUsd?: number;
    ms: number;
    outcome: DecisionOutcome;
}

export async function decideChoice(
    env: Env,
    input: {
        kind: DecisionKind;
        state: string;
        instructions: string;
        candidates: DecisionCandidate[];
        userHash?: string;
    },
): Promise<DecisionResult | null> {
    const model = decisionModel(env);
    const candidates = input.candidates.slice(0, MAX_OPTIONS);
    if (!model || candidates.length === 0) return null;
    // Counted before the fetch so a flood can't spend tokens. No userHash = not a person's call (the eval).
    if (input.userHash && !(await withinDailyBudget(env, "decision", input.userHash, DAILY_DECISIONS))) return null;

    const startedAt = Date.now();
    const finish = (
        outcome: DecisionOutcome,
        extra: { id?: string | null; top?: string | null; probability?: number; servedModel?: string; inputTokens?: number; costUsd?: number } = {},
    ): DecisionResult => {
        const ms = Date.now() - startedAt;
        logger.info("ai", "ai_decision", {
            kind: input.kind,
            model,
            servedModel: extra.servedModel,
            inputTokens: extra.inputTokens,
            costUsd: extra.costUsd,
            ms,
            outcome,
            userHash: input.userHash,
        });
        return { id: extra.id ?? null, top: extra.top ?? null, probability: extra.probability ?? 0, model, costUsd: extra.costUsd, ms, outcome };
    };

    // Opaque keys: the model never sees an id, and the user's labels never double as keys.
    const keys = candidates.map((_, i) => `o${i + 1}`);
    const criteria: Record<string, string> = { none: "None of the options clearly fits." };
    candidates.forEach((candidate, i) => (criteria[keys[i]] = candidate.label));

    try {
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                // No fallback providers: the model that answers is the one calibrated above.
                provider: { allow_fallbacks: false },
                state: input.state,
                questions: { pick: { type: "choice", instructions: input.instructions, criteria } },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) return finish("error");
        const body = (await response.json()) as {
            model?: string;
            answers?: { pick?: { choice?: unknown; probabilities?: Record<string, number> } };
            usage?: { input_tokens?: number; cost?: number };
        };
        const meta = { servedModel: body.model, inputTokens: body.usage?.input_tokens, costUsd: body.usage?.cost };
        const answer = body.answers?.pick;
        // The winner is the largest probability; fall back to the answer's own `choice` when none are given.
        let best = typeof answer?.choice === "string" ? answer.choice : null;
        let probability = best && answer?.probabilities ? answer.probabilities[best] ?? 0 : 0;
        for (const [key, p] of Object.entries(answer?.probabilities ?? {})) {
            if (typeof p === "number" && p > probability) [best, probability] = [key, p];
        }
        if (!best || best === "none") return finish("abstained", { ...meta, probability });
        const index = keys.indexOf(best);
        if (index < 0) return finish("error", meta);
        const threshold = DECISION_THRESHOLDS[model]?.[input.kind] ?? UNCALIBRATED_THRESHOLD;
        if (probability < threshold) return finish("below_threshold", { ...meta, probability, top: candidates[index].id });
        return finish("chose", { ...meta, id: candidates[index].id, top: candidates[index].id, probability });
    } catch (error) {
        return finish(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "error");
    }
}
