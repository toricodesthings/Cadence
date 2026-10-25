/**
 * Decision adapter: one request of named questions (`choice` or `score`) to an OpenRouter decision model.
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

export type DecisionKind = "placement" | "search" | "assistant_search" | "effort" | "priority_said";
export type DecisionOutcome = "chose" | "abstained" | "below_threshold" | "timeout" | "error";

/** Shown only when the top option's probability is at least this. Used for a model with no entry below. */
const UNCALIBRATED_THRESHOLD = 0.9;

/**
 * Thresholds per pinned model ID and kind, filled in from the evaluation (tests/evals/decisions.eval.ts).
 * A model with no entry is "uncalibrated" and uses the conservative fallback.
 */
export const DECISION_THRESHOLDS: Record<string, Partial<Record<DecisionKind, number>>> = {
    // 2026-10-25 eval (2 passes, held-out confirmed): each the lowest swept threshold above every wrong answer seen.
    // placement 88% coverage, 0 wrong (0.5 showed 6% wrong); search 97% / 0; priority_said 79% / 0 invented;
    // effort 83% / 0 guesses where their choices show none.
    "microsoft/microsoft-decision-1-20261009": { placement: 0.8, search: 0.6, assistant_search: 0.6, priority_said: 0.85, effort: 0.9 },
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

/** The switch in Settings › Tasks & Routines: on unless it is exactly `false`. */
/** `settings.tasks.intelligence`: the switches every model decision reads first. */
export async function intelligenceOf(tx: Tx, userId: string) {
    const [user] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    return user?.settings?.tasks?.intelligence;
}

export async function smartPlacementOn(tx: Tx, userId: string): Promise<boolean> {
    return (await intelligenceOf(tx, userId))?.smartPlacement !== false;
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

export type DecisionQuestion =
    | { type: "choice"; instructions: string; candidates: DecisionCandidate[] }
    /** An ordered rubric, lowest first. The result's `id` is the winning level's index as a string ("0"…). */
    | { type: "score"; instructions: string; levels: string[] };

type Answer = { choice?: unknown; probabilities?: Record<string, number> };

/** The winner is the largest probability; fall back to the answer's own `choice` when none are given. */
function winner(answer: { choice?: unknown; probabilities?: Record<string, number> } | undefined) {
    let best = typeof answer?.choice === "string" ? answer.choice : null;
    let probability = best && answer?.probabilities ? answer.probabilities[best] ?? 0 : 0;
    for (const [key, p] of Object.entries(answer?.probabilities ?? {})) {
        if (typeof p === "number" && p > probability) [best, probability] = [key, p];
    }
    return { best, probability };
}

/**
 * Asks every question in one request: one network call, one budget unit, one log line. Each question has its own
 * kind (its own threshold). A question that can't be asked, or a whole request that fails, resolves to null / a non-"chose" outcome.
 */
export async function decide(
    env: Env,
    input: { kinds: Record<string, DecisionKind>; state: string | object; questions: Record<string, DecisionQuestion>; userHash?: string },
): Promise<Record<string, DecisionResult | null>> {
    const model = decisionModel(env);
    const names = Object.keys(input.questions).filter((name) => {
        const q = input.questions[name];
        return q.type === "score" ? q.levels.length > 0 : q.candidates.length > 0;
    });
    const out: Record<string, DecisionResult | null> = Object.fromEntries(Object.keys(input.questions).map((name) => [name, null]));
    if (!model || names.length === 0) return out;
    // Counted before the fetch so a flood can't spend tokens. No userHash = not a person's call (the eval).
    if (input.userHash && !(await withinDailyBudget(env, "decision", input.userHash, DAILY_DECISIONS))) return out;

    const startedAt = Date.now();
    const outcomes: Record<string, DecisionOutcome> = {};
    const finish = (
        name: string,
        outcome: DecisionOutcome,
        meta: { servedModel?: string; inputTokens?: number; costUsd?: number },
        extra: { id?: string | null; top?: string | null; probability?: number } = {},
    ) => {
        outcomes[name] = outcome;
        out[name] = { id: extra.id ?? null, top: extra.top ?? null, probability: extra.probability ?? 0, model, costUsd: meta.costUsd, ms: Date.now() - startedAt, outcome };
    };
    const log = (meta: { servedModel?: string; inputTokens?: number; costUsd?: number } = {}) =>
        logger.info("ai", "ai_decision", { kind: names.map((n) => input.kinds[n]).join(","), model, ...meta, ms: Date.now() - startedAt, outcome: names.map((n) => outcomes[n]).join(","), outcomes, userHash: input.userHash });
    const failAll = (outcome: DecisionOutcome) => {
        for (const name of names) finish(name, outcome, {});
        log();
        return out;
    };

    // Opaque keys: the model never sees an id, and the user's labels never double as keys.
    const asked = Object.fromEntries(names.map((name) => {
        const q = input.questions[name];
        if (q.type === "score") return [name, { type: "score", instructions: q.instructions, criteria: q.levels }];
        const criteria: Record<string, string> = { none: "None of the options clearly fits." };
        q.candidates.slice(0, MAX_OPTIONS).forEach((candidate, i) => (criteria[`o${i + 1}`] = candidate.label));
        return [name, { type: "choice", instructions: q.instructions, criteria }];
    }));

    try {
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                // No fallback providers: the model that answers is the one calibrated above.
                provider: { allow_fallbacks: false },
                state: input.state,
                questions: asked,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) return failAll("error");
        const body = (await response.json()) as { model?: string; answers?: Record<string, Answer>; usage?: { input_tokens?: number; cost?: number } };
        const meta = { servedModel: body.model, inputTokens: body.usage?.input_tokens, costUsd: body.usage?.cost };
        for (const name of names) {
            const q = input.questions[name];
            const { best, probability } = winner(body.answers?.[name]);
            const threshold = DECISION_THRESHOLDS[model]?.[input.kinds[name]] ?? UNCALIBRATED_THRESHOLD;
            if (q.type === "score") {
                const level = best !== null ? Number(best) : NaN;
                if (!Number.isInteger(level) || level < 0 || level >= q.levels.length) finish(name, "abstained", meta, { probability });
                else if (probability < threshold) finish(name, "below_threshold", meta, { probability, top: String(level) });
                else finish(name, "chose", meta, { id: String(level), top: String(level), probability });
                continue;
            }
            const candidates = q.candidates.slice(0, MAX_OPTIONS);
            if (!best || best === "none") { finish(name, "abstained", meta, { probability }); continue; }
            const index = Number(/^o(\d+)$/.exec(best)?.[1]) - 1;
            if (!candidates[index]) finish(name, "error", meta);
            else if (probability < threshold) finish(name, "below_threshold", meta, { probability, top: candidates[index].id });
            else finish(name, "chose", meta, { id: candidates[index].id, top: candidates[index].id, probability });
        }
        log(meta);
        return out;
    } catch (error) {
        return failAll(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "error");
    }
}

/** One `choice` question: placement and search. */
export async function decideChoice(
    env: Env,
    input: { kind: DecisionKind; state: string; instructions: string; candidates: DecisionCandidate[]; userHash?: string },
): Promise<DecisionResult | null> {
    const { kind, candidates, instructions, state, userHash } = input;
    return (await decide(env, { kinds: { pick: kind }, state, questions: { pick: { type: "choice", instructions, candidates } }, userHash })).pick;
}
