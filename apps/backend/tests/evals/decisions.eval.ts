/**
 * Decision-model evals (S1 placement, S2 did-you-mean): the adapter against a real decision model, on
 * synthetic rosters. Iteration runs once; full validation also re-cases labels and reshuffles, so a model that
 * leans on position or spelling shows up. Costs a little, so it never runs with `pnpm test`:
 * `AI_DECISION_MODEL=<dated id> pnpm eval:decisions` (OPENROUTER_API_KEY in env or `.dev.vars`).
 *
 * Prints, per kind: outcomes, latency, cost, shown-and-wrong rate, coverage (shown and right among cases that have a right answer),
 * the best threshold that meets the gate, and a local word-overlap baseline on the same cases. Writes
 * root `output/evals/decisions-<model>-<profile>.json`. The gates (plan 0.31.0): S1 wrong ≤ 5% and coverage ≥ 60%;
 * S2 right ≥ 70% where one exists and wrong ≤ 10% where none does.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DECISION_THRESHOLDS, decideChoice, type DecisionKind } from "../../src/domains/decisions/decision";
import { evaluationOptions, evaluationVars } from "./run-options";
import type { Env } from "../../src/types/env";
import { PLACEMENT_CASES, SEARCH_CASES, ROSTER, TASKS } from "./decisions-data";
import placementPrompt from "../../src/prompts/decisions/placement.md";
import didYouMeanPrompt from "../../src/prompts/decisions/did-you-mean.md";

const vars = evaluationVars();
const evaluation = evaluationOptions(vars);
const env = {
    OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY,
    AI_DECISION_MODEL: vars.AI_DECISION_MODEL,
} as Env;
const live = Boolean(env.OPENROUTER_API_KEY && env.AI_DECISION_MODEL);

/** A seeded shuffle, so a run is repeatable. */
function shuffled<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let state = seed || 1;
    for (let i = out.length - 1; i > 0; i--) {
        state = (state * 1664525 + 1013904223) % 4294967296;
        const j = state % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

const tokens = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
/** The local baseline: the option sharing the most words with the text, or none. */
function baseline(text: string, options: { id: string; label: string }[]): string | null {
    const have = tokens(text);
    let best: string | null = null;
    let top = 0;
    for (const option of options) {
        const score = [...tokens(option.label)].filter((word) => have.has(word)).length;
        if (score > top) [best, top] = [option.id, score];
    }
    return best;
}

type Row = { expected: string | null; got: string | null; probability: number; base: string | null; outcome: string; ms: number; costUsd: number };
const results: Record<string, Row[]> = {};

function summarize(rows: Row[], gate: { wrong: number; right: number }) {
    const answerable = rows.filter((r) => r.expected);
    const unanswerable = rows.filter((r) => !r.expected);
    const at = (threshold: number, pick: (r: Row) => string | null) => {
        const shown = (r: Row) => pick(r) !== null && (pick === baselinePick || r.probability >= threshold);
        const right = answerable.filter((r) => shown(r) && pick(r) === r.expected).length;
        const wrong = rows.filter((r) => shown(r) && pick(r) !== r.expected).length;
        return {
            coverage: answerable.length ? right / answerable.length : 0,
            wrongOfShown: rows.filter(shown).length ? wrong / rows.filter(shown).length : 0,
            wrongOfNone: unanswerable.length ? unanswerable.filter(shown).length / unanswerable.length : 0,
        };
    };
    const model = (r: Row) => r.got;
    const sweep = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98].map((t) => ({ threshold: t, ...at(t, model) }));
    const meets = sweep.find((s) => s.wrongOfShown <= gate.wrong && s.coverage >= gate.right);
    const times = rows.map((r) => r.ms).sort((a, b) => a - b);
    const count = (outcome: string) => rows.filter((r) => r.outcome === outcome).length;
    return {
        cases: rows.length,
        outcomes: { chose: count("chose"), abstained: count("abstained"), below_threshold: count("below_threshold"), timeout: count("timeout"), error: count("error") },
        ms: { p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)] },
        costUsd: rows.reduce((sum, r) => sum + r.costUsd, 0),
        sweep, firstThresholdMeetingGate: meets?.threshold ?? null, baseline: at(0, baselinePick) };
}
const baselinePick = (r: Row) => r.base;

async function run(kind: Extract<DecisionKind, "placement" | "search">, cases: typeof PLACEMENT_CASES | typeof SEARCH_CASES, options: { id: string; label: string }[], instructions: string) {
    const rows: Row[] = [];
    for (const [index, c] of cases.entries()) {
        for (let pass = 1; pass <= Math.min(evaluation.decisionRuns, 2); pass++) {
            const shuffledOptions = shuffled(options, index * 7 + pass).map((o) => ({ ...o, label: pass === 2 ? o.label.toUpperCase() : o.label }));
            const decision = await decideChoice(env, { kind, state: c.text, instructions, candidates: shuffledOptions });
            rows.push({
                expected: c.expected,
                got: decision?.id ?? null,
                probability: decision?.probability ?? 0,
                base: baseline(c.text, options),
                outcome: decision?.outcome ?? "error",
                ms: decision?.ms ?? 0,
                costUsd: decision?.costUsd ?? 0,
            });
        }
    }
    return rows;
}

describe.skipIf(!live)("decisions", () => {
    it("S1: placement", async () => {
        DECISION_THRESHOLDS[env.AI_DECISION_MODEL!] = { placement: 0, search: 0 }; // raw top choice; thresholds are swept below
        const pairs = ROSTER.map((r) => ({ id: r.id, label: r.label }));
        results.placement = await run("placement", PLACEMENT_CASES, pairs, placementPrompt.trimEnd());
        expect(results.placement.length).toBeGreaterThan(0);
    });
    it("S2: did you mean", async () => {
        DECISION_THRESHOLDS[env.AI_DECISION_MODEL!] = { placement: 0, search: 0 };
        results.search = await run("search", SEARCH_CASES, TASKS.map((t) => ({ id: t.id, label: t.title })), didYouMeanPrompt.trimEnd());
        expect(results.search.length).toBeGreaterThan(0);
    });
    afterAll(() => {
        const report = {
            profile: evaluation.profile,
            runs: Math.min(evaluation.decisionRuns, 2),
            model: env.AI_DECISION_MODEL,
            placement: results.placement && summarize(results.placement, { wrong: 0.05, right: 0.6 }),
            search: results.search && summarize(results.search, { wrong: 0.1, right: 0.7 }),
        };
        const dir = join(__dirname, "../../../../output/evals");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `decisions-${env.AI_DECISION_MODEL!.replace(/[^a-z0-9.]+/gi, "_")}-${evaluation.profile}.json`), JSON.stringify(report, null, 2));
        console.info(JSON.stringify(report, null, 2));
    });
});
