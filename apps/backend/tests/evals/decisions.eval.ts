/**
 * Decision-model evals and threshold calibration: S1 placement and `priority_said` (asked together, as a capture
 * asks them), E3 `effort` (persona histories, held-out titles, beside `priority_said` as a capture with E3 asks it) and
 * S2 did-you-mean, against a real decision model. The questions come from the production builders. Every kind is asked at
 * threshold 0 and swept afterwards: a threshold is chosen on the tuning split (70%) and confirmed on the held-out split (30%).
 * Pass 2 (full) re-cases and reshuffles labels, lowercases the text and reverses Effort's levels, so position or
 * spelling bias shows up. Answers are cached by request in root `output/evals/decisions-cache.json`, so a re-run asks only
 * new cases (delete it to ask again). `AI_DECISION_MODEL=<dated id> pnpm eval:decisions` (OPENROUTER_API_KEY in env or
 * `.dev.vars`); writes root `output/evals/decisions-<model>-<profile>.json`.
 *
 * Gates: placement wrong ≤ 5% of shown, coverage ≥ 60%; search right ≥ 70% where one exists, wrong ≤ 10% where none does;
 * priority_said nothing invented and wrong ≤ 5% of shown; effort off by two ≤ 2% and wrong (a guess where their choices show
 * none) ≤ 5% of shown, coverage ≥ 40% of the titles
 * `suggestEffort` left open. The local parser and `suggestEffort` are scored on the same cases for free.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { effortGuessOf } from "@cadence/domain/effort-guess";
import { addDays } from "@cadence/domain/time";
import { parsePriority } from "@cadence/nlp/parse";
import type { EffortEvidence } from "@cadence/nlp/effort";
import { DECISION_THRESHOLDS, decide, type DecisionKind, type DecisionQuestion, type DecisionResult } from "../../src/domains/decisions/decision";
import { placementQuestion, priorityQuestion } from "../../src/domains/decisions/placement";
import { effortAsk, effortChoices } from "../../src/domains/decisions/effort-guess";
import { evaluationOptions, evaluationVars } from "./run-options";
import type { Env } from "../../src/types/env";
import { EFFORT_PERSONAS, PLACEMENT_CASES, PRIORITY_CASES, ROSTER, SEARCH_CASES, TASKS } from "./decisions-data";
import didYouMeanPrompt from "../../src/prompts/decisions/did-you-mean.md";

const vars = evaluationVars();
const evaluation = evaluationOptions(vars);
const env = { OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY, AI_DECISION_MODEL: vars.AI_DECISION_MODEL } as Env;
const model = env.AI_DECISION_MODEL ?? "";
const live = Boolean(env.OPENROUTER_API_KEY && model);
const PASSES = Math.min(evaluation.decisionRuns, 2);
const TODAY = "2026-10-25";
const DIR = join(__dirname, "../../../../output/evals");
const SWEEP = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99];

// ── Answers cached by request body (it names the model), so only new or changed cases cost a call ──
const CACHE = join(DIR, "decisions-cache.json");
const cache: Record<string, unknown> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const spent = { calls: 0, cached: 0, costUsd: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input instanceof Request ? input.url : input).includes("/api/alpha/decisions")) return realFetch(input, init);
    const key = createHash("sha256").update(String(init?.body)).digest("hex");
    if (key in cache) spent.cached++;
    else {
        const response = await realFetch(input, init);
        if (!response.ok) return response; // not cached: asked again next run
        cache[key] = await response.json();
        spent.calls++;
        spent.costUsd += (cache[key] as { usage?: { cost?: number } }).usage?.cost ?? 0;
    }
    return new Response(JSON.stringify(cache[key]), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

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
const heldOut = (text: string) => createHash("sha256").update(text).digest()[0] % 10 < 3;
/** Pass 2's texting register: lowercase, no closing full stop. */
const casual = (text: string) => text.toLowerCase().replace(/\.\s*$/, "");

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
    const queue = [...items];
    await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await work(queue.shift()!); }));
}

// ── Rows: one per question answered. `ok` holds every acceptable answer ("none" where abstaining is right) ──
type Row = { kind: string; text: string; heldOut: boolean; pass: number; ok: string[]; got: string | null; probability: number; outcome: string; ms: number; group?: string };
const rows: Row[] = [];
const local: { kind: string; text: string; ok: string[]; got: string }[] = [];
const notAsked: string[] = [];

const answerOf = (d: DecisionResult | null | undefined) => (!d || d.outcome === "error" || d.outcome === "timeout" ? null : d.top ?? "none");
function push(kind: string, text: string, pass: number, ok: string[], d: DecisionResult | null | undefined, group?: string, got = answerOf(d)) {
    rows.push({ kind, text, heldOut: heldOut(text), pass, ok, got, probability: d?.probability ?? 0, outcome: d?.outcome ?? "error", ms: d?.ms ?? 0, group });
}
const levelsOk = (ok: number[]) => ok.map((n) => (n === 0 ? "none" : String(n)));

/** One capture: placement and/or priority_said in one request, as `suggestPlacement` asks them. */
async function capture(text: string, pass: number, seed: number, labels: { pick?: string | null; also?: string; priority: number[]; group?: string }) {
    const pairs = shuffled(ROSTER, seed).map((r) => ({ ...r, label: pass === 2 ? r.label.toUpperCase() : r.label }));
    const said = priorityQuestion(text);
    const questions: Record<string, DecisionQuestion> = { pick: placementQuestion(pairs, text) };
    const kinds: Record<string, DecisionKind> = { pick: "placement" };
    if (said) [questions.priority, kinds.priority] = [said, "priority_said"];
    else {
        const parsed = parsePriority(text).entities[0]?.normalizedValue;
        local.push({ kind: "parser", text, ok: levelsOk(labels.priority), got: String(parsed) });
    }
    const answers = await decide(env, { kinds, state: text, questions });
    if (labels.pick !== undefined) push("placement", text, pass, [labels.pick ?? "none", ...(labels.also ? [labels.also] : [])], answers.pick);
    if (said) push("priority_said", text, pass, levelsOk(labels.priority), answers.priority, labels.group);
}

type Gate = (s: Stats) => boolean;
type Stats = ReturnType<typeof statsAt>;
function statsAt(set: Row[], threshold: number) {
    const answered = set.filter((r) => r.got !== null);
    const shown = answered.filter((r) => r.got !== "none" && r.probability >= threshold);
    const wrong = shown.filter((r) => !r.ok.includes(r.got!));
    const answerable = answered.filter((r) => r.ok.some((o) => o !== "none"));
    const off = (n: number) => shown.filter((r) => Math.abs(Number(r.got) - Number(r.ok[0])) === n).length;
    const rate = (n: number, d: number) => (d ? Number((n / d).toFixed(3)) : 0);
    return {
        threshold,
        shown: shown.length,
        coverage: rate(shown.filter((r) => r.ok.includes(r.got!)).length, answerable.length),
        wrongOfShown: rate(wrong.length, shown.length),
        /** Shown where abstaining was acceptable and the answer was not: a priority the words never stated. */
        invented: wrong.filter((r) => r.ok.includes("none")).length,
        shownWhereNone: rate(answered.filter((r) => r.ok.length === 1 && r.ok[0] === "none").filter((r) => shown.includes(r)).length, answered.filter((r) => r.ok.length === 1 && r.ok[0] === "none").length),
        offByOne: rate(off(1), shown.length),
        offByTwo: rate(off(2), shown.length),
    };
}

function summarize(kind: string, gate: Gate) {
    const all = rows.filter((r) => r.kind === kind);
    if (!all.length) return undefined;
    const tune = all.filter((r) => !r.heldOut);
    const test = all.filter((r) => r.heldOut);
    const chosen = SWEEP.find((t) => gate(statsAt(tune, t))) ?? null;
    const times = all.map((r) => r.ms).sort((a, b) => a - b);
    const count = (o: string) => all.filter((r) => r.outcome === o).length;
    return {
        cases: all.length,
        outcomes: { chose: count("chose"), abstained: count("abstained"), timeout: count("timeout"), error: count("error") },
        ms: { p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)] },
        current: DECISION_THRESHOLDS_BEFORE[kind as DecisionKind] ?? 0.9,
        chosenOnTuning: chosen,
        heldOutAtChosen: chosen === null ? null : { ...statsAt(test, chosen), meetsGate: gate(statsAt(test, chosen)) },
        allAtChosen: chosen === null ? null : statsAt(all, chosen),
        sweep: SWEEP.map((t) => statsAt(all, t)),
        // Every shown-and-wrong answer at 0.5, for reading by eye.
        wrong: all.filter((r) => r.got && r.got !== "none" && r.probability >= 0.5 && !r.ok.includes(r.got))
            .map((r) => ({ text: r.text, pass: r.pass, ok: r.ok, got: r.got, p: Number(r.probability.toFixed(3)), group: r.group })),
    };
}

const DECISION_THRESHOLDS_BEFORE = { ...DECISION_THRESHOLDS[model] };
const RAW: Partial<Record<DecisionKind, number>> = { placement: 0, search: 0, priority_said: 0, effort: 0 };

describe.skipIf(!live)("decisions", () => {
    it("S1: placement and priority_said, one request per capture", async () => {
        DECISION_THRESHOLDS[model] = RAW; // raw top choice; thresholds are swept below
        const jobs = [
            ...PLACEMENT_CASES.map((c, i) => ({ text: c.text, seed: i * 7, labels: { pick: c.expected, also: c.also, priority: [0], group: "placement text" } })),
            ...PRIORITY_CASES.map((c, i) => ({ text: c.text, seed: i * 11, labels: { priority: c.ok, group: c.trap ?? "stated" } })),
        ].flatMap((job) => Array.from({ length: PASSES }, (_, p) => ({ ...job, pass: p + 1 })));
        await pool(jobs, 8, (j) => capture(j.pass === 2 ? casual(j.text) : j.text, j.pass, j.seed + j.pass, j.labels));
        expect(rows.some((r) => r.kind === "placement")).toBe(true);
    });

    it("E3: effort from persona histories, beside priority_said as a capture with E3 asks it", async () => {
        DECISION_THRESHOLDS[model] = RAW;
        const jobs: (() => Promise<void>)[] = [];
        for (const persona of EFFORT_PERSONAS) {
            const evidence: EffortEvidence[] = persona.choices.map(([title, list, level], i) => ({ title, projectId: list, level, origin: "manual", day: addDays(TODAY, -i * 6) }));
            const names = new Map(Object.entries(persona.lists));
            for (const [title, list, level, unsure] of persona.held) {
                const ok = level ? [String(level), ...(unsure ? ["none"] : [])] : ["none"];
                const task = { title, projectId: list };
                const guess = effortGuessOf({ effort: null, ...task }, evidence, TODAY);
                if (guess) { local.push({ kind: "suggestEffort", text: `${persona.name}: ${title}`, ok, got: String(guess.level) }); continue; }
                const manual = effortChoices(task, evidence, TODAY);
                if (!manual) { notAsked.push(`${persona.name}: ${title}`); continue; }
                const ask = effortAsk(task, manual, names);
                for (let pass = 1; pass <= PASSES; pass++) jobs.push(async () => {
                    const reversed = pass === 2;
                    const question = ask.question.type === "score" && reversed ? { ...ask.question, levels: [...ask.question.levels].reverse() } : ask.question;
                    const said = priorityQuestion(title);
                    const answers = await decide(env, {
                        kinds: { effort: "effort", ...(said && { priority: "priority_said" as const }) },
                        state: ask.state,
                        questions: { effort: question, ...(said && { priority: said }) },
                    });
                    const index = answerOf(answers.effort);
                    const got = index === null || index === "none" ? index : String(reversed ? 3 - Number(index) : Number(index) + 1);
                    push("effort", `${persona.name}: ${title}`, pass, ok, answers.effort, level && !unsure ? persona.name : "unclear", got);
                    if (said) push("priority_said", title, pass, ["none"], answers.priority, "effort state");
                });
            }
        }
        await pool(jobs, 8, (job) => job());
        expect(notAsked.every((t) => t.startsWith("sparse:"))).toBe(true);
    });

    it("S2: did you mean", async () => {
        DECISION_THRESHOLDS[model] = RAW;
        const options = TASKS.map((t) => ({ id: t.id, label: t.title }));
        const jobs = SEARCH_CASES.flatMap((c, i) => Array.from({ length: PASSES }, (_, p) => ({ c, i, pass: p + 1 })));
        await pool(jobs, 8, async ({ c, i, pass }) => {
            const candidates = shuffled(options, i * 7 + pass).map((o) => ({ ...o, label: pass === 2 ? o.label.toUpperCase() : o.label }));
            const answers = await decide(env, { kinds: { pick: "search" }, state: c.text, questions: { pick: { type: "choice", instructions: didYouMeanPrompt.trimEnd(), candidates } } });
            push("search", c.text, pass, [c.expected ?? "none"], answers.pick);
        });
        expect(rows.some((r) => r.kind === "search")).toBe(true);
    });

    afterAll(() => {
        DECISION_THRESHOLDS[model] = DECISION_THRESHOLDS_BEFORE;
        const localScore = (kind: string) => {
            const set = local.filter((l) => l.kind === kind);
            const wrong = set.filter((l) => !l.ok.includes(l.got === "undefined" ? "none" : l.got));
            return { cases: set.length, wrong: wrong.length, misreads: wrong.map((l) => ({ text: l.text, ok: l.ok, got: l.got })) };
        };
        const report = {
            profile: evaluation.profile,
            passes: PASSES,
            model,
            spent,
            placement: summarize("placement", (s) => s.wrongOfShown <= 0.05 && s.coverage >= 0.6),
            priority_said: summarize("priority_said", (s) => s.invented === 0 && s.wrongOfShown <= 0.05),
            effort: summarize("effort", (s) => s.offByTwo <= 0.02 && s.wrongOfShown <= 0.05 && s.coverage >= 0.4),
            search: summarize("search", (s) => s.coverage >= 0.7 && s.shownWhereNone <= 0.1),
            parser: localScore("parser"),
            suggestEffort: localScore("suggestEffort"),
            effortNotAsked: notAsked,
        };
        mkdirSync(DIR, { recursive: true });
        writeFileSync(CACHE, JSON.stringify(cache));
        writeFileSync(join(DIR, `decisions-${model.replace(/[^a-z0-9.]+/gi, "_")}-${evaluation.profile}.json`), JSON.stringify(report, null, 2));
        const line = (k: "placement" | "priority_said" | "effort" | "search") => {
            const s = report[k];
            return s && `${k.padEnd(14)} ${String(s.cases).padStart(4)} rows · chosen ${s.chosenOnTuning ?? "none meets gate"} (now ${s.current}) · held-out ${JSON.stringify(s.heldOutAtChosen)}`;
        };
        console.info([`decisions [${evaluation.profile}] ${model}: ${spent.calls} new calls ($${spent.costUsd.toFixed(5)}), ${spent.cached} cached`,
            line("placement"), line("priority_said"), line("effort"), line("search"),
            `parser misreads ${report.parser.wrong}/${report.parser.cases} · suggestEffort wrong ${report.suggestEffort.wrong}/${report.suggestEffort.cases}`].join("\n"));
    });
});

