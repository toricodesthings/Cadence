/**
 * E3: score a new task's Effort from this person's own earlier choices, in the background.
 *
 * Runs only when `suggestEffort` found no single level, the person has enough of their own `manual` choices (no cold-start
 * guess for a new account), and both switches are on. The answer is stored beside the task as a guess (`effort_guess`),
 * never as its Effort. Only the person's own task titles reach the provider.
 */
import { and, eq, isNull } from "drizzle-orm";
import { toEvidence } from "@cadence/domain/effort-evidence";
import { effortGuessOf } from "@cadence/domain/effort-guess";
import { daysBetween, todayIn, type LocalDate } from "@cadence/domain/time";
import { meaningOf, similarity, type EffortEvidence } from "@cadence/nlp/effort";
import { projects, tasks } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { hashIdentifier, logger } from "../../platform/log";
import { withRls } from "../../platform/rls";
import { userZone } from "../../platform/user-zone";
import type { Env } from "../../types/env";
import { readEffortEvidence } from "../tasks/tasks.service";
import type { Tx } from "../../types/db";
import { decide, decisionModel, intelligenceOf, type DecisionQuestion, type DecisionResult } from "./decision";
import instructions from "../../prompts/decisions/effort.md";

const MIN_CHOICES = 8;
const EXAMPLES = 20;
const LEVELS = ["Low: they rate tasks like this light", "Medium: they rate tasks like this middling", "High: they rate tasks like this heavy"];
const NAMES = ["Low", "Medium", "High"];
const INSTRUCTIONS = instructions.trimEnd();

type Intelligence = Awaited<ReturnType<typeof intelligenceOf>>;

export interface EffortAsk {
    state: { task: { title: string; list?: string }; their_choices: { title: string; list?: string; effort: string }[] };
    question: DecisionQuestion;
}

/**
 * The `effort` question for a title, or null when E3 doesn't apply: a switch is off, a similar choice already
 * guesses it, or the person has too few of their own choices (no cold-start guess).
 */
export async function effortQuestion(tx: Tx, userId: string, task: GuessTask, intelligence: Intelligence): Promise<EffortAsk | null> {
    if (intelligence?.smartPlacement === false || intelligence?.nlpEnabled === false || intelligence?.effortSuggestions === false) return null;
    const zone = await userZone(tx, userId);
    const manual = effortChoices(task, toEvidence(await readEffortEvidence(tx, userId), zone), todayIn(zone));
    if (!manual) return null;
    const names = new Map((await tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId))).map((p) => [p.id, p.name]));
    return effortAsk(task, manual, names);
}

type GuessTask = { title: string; projectId: string | null };

/** Their `manual` choices of the last 365 days when E3 applies (≥ 8 covering ≥ 2 levels, no similar-match guess), else null. Pure. */
export function effortChoices(task: GuessTask, evidence: EffortEvidence[], today: LocalDate): EffortEvidence[] | null {
    const manual = evidence.filter((e) => e.origin === "manual" && daysBetween(e.day, today) <= 365);
    if (manual.length < MIN_CHOICES || new Set(manual.map((e) => e.level)).size < 2) return null;
    if (effortGuessOf({ effort: null, title: task.title, projectId: task.projectId }, evidence, today)) return null;
    return manual;
}

/** The question over their 20 nearest choices. Pure. */
export function effortAsk(task: GuessTask, manual: EffortEvidence[], names: Map<string, string>): EffortAsk {
    const own = meaningOf(task.title);
    const their_choices = manual
        .map((e, i) => ({ e, i, sim: similarity(own, meaningOf(e.title)) }))
        .sort((a, b) => b.sim - a.sim || a.i - b.i)
        .slice(0, EXAMPLES)
        .map(({ e }) => ({ title: e.title, ...(e.projectId && names.has(e.projectId) && { list: names.get(e.projectId) }), effort: NAMES[e.level - 1] }));
    const list = task.projectId ? names.get(task.projectId) : undefined;
    return {
        state: { task: { title: task.title, ...(list && { list }) }, their_choices },
        question: { type: "score", instructions: INSTRUCTIONS, levels: LEVELS },
    };
}

/** The level a `score` answer chose (1–3), or null. */
export const levelOf = (answer: DecisionResult | null | undefined) => (answer?.id == null ? null : Number(answer.id) + 1);

export async function suggestEffortGuess(env: Env, userId: string, taskId: string): Promise<void> {
    try {
        if (!decisionModel(env)) return;
        const db = getDbClient(env);
        const loaded = await withRls(db, userId, async (tx) => {
            const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
            if (!task || task.effort != null || task.effortGuessSource || task.recurrenceRule || !["ACTIVE", "WAITING"].includes(task.state)) return null;
            const ask = await effortQuestion(tx, userId, task, await intelligenceOf(tx, userId));
            return ask && { title: task.title, projectId: task.projectId, ask };
        });
        if (!loaded) return;

        const answers = await decide(env, {
            kinds: { effort: "effort" },
            state: loaded.ask.state,
            questions: { effort: loaded.ask.question },
            userHash: await hashIdentifier(userId),
        });
        const level = levelOf(answers.effort);
        if (!level) return;

        // Only if nothing changed during the call: still unset, same title and list, no guess or "no thanks" yet.
        await withRls(db, userId, (tx) =>
            tx.update(tasks)
                .set({ effortGuess: level, effortGuessSource: "model", effortGuessAt: new Date().toISOString() })
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.title, loaded.title), loaded.projectId ? eq(tasks.projectId, loaded.projectId) : isNull(tasks.projectId), isNull(tasks.effort), isNull(tasks.effortGuessSource))));
    } catch (error) {
        logger.warn("ai", "effort_guess_failed", { reason: error instanceof Error ? error.message.slice(0, 117) : "unknown_error" });
    }
}
