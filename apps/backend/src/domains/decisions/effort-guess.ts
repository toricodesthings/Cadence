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
import { daysBetween, todayIn } from "@cadence/domain/time";
import { meaningOf, similarity } from "@cadence/nlp/effort";
import { projects, tasks, users } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { hashIdentifier, logger } from "../../platform/log";
import { withRls } from "../../platform/rls";
import { userZone } from "../../platform/user-zone";
import type { Env } from "../../types/env";
import { readEffortEvidence } from "../tasks/tasks.service";
import { decide, decisionModel } from "./decision";
import instructions from "../../prompts/decisions/effort.md";

const MIN_CHOICES = 8;
const EXAMPLES = 20;
const LEVELS = ["Low: they rate tasks like this light", "Medium: they rate tasks like this middling", "High: they rate tasks like this heavy"];
const NAMES = ["Low", "Medium", "High"];

export async function suggestEffortGuess(env: Env, userId: string, taskId: string): Promise<void> {
    try {
        if (!decisionModel(env)) return;
        const db = getDbClient(env);
        const loaded = await withRls(db, userId, async (tx) => {
            const [user] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
            const intelligence = user?.settings?.tasks?.intelligence;
            if (intelligence?.smartPlacement === false || intelligence?.nlpEnabled === false || intelligence?.effortSuggestions === false) return null;
            const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
            if (!task || task.effort != null || task.effortGuessSource || task.recurrenceRule || !["ACTIVE", "WAITING"].includes(task.state)) return null;

            const zone = await userZone(tx, userId);
            const today = todayIn(zone);
            const rows = await readEffortEvidence(tx, userId);
            const evidence = toEvidence(rows, zone);
            const manual = evidence.filter((e) => e.origin === "manual" && daysBetween(e.day, today) <= 365);
            if (manual.length < MIN_CHOICES || new Set(manual.map((e) => e.level)).size < 2) return null;
            if (effortGuessOf({ effort: null, title: task.title, projectId: task.projectId }, evidence, today)) return null;

            const names = new Map((await tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId))).map((p) => [p.id, p.name]));
            const own = meaningOf(task.title);
            const choices = manual
                .map((e, i) => ({ e, i, sim: similarity(own, meaningOf(e.title)) }))
                .sort((a, b) => b.sim - a.sim || a.i - b.i)
                .slice(0, EXAMPLES)
                .map(({ e }) => ({ title: e.title, ...(e.projectId && names.has(e.projectId) && { list: names.get(e.projectId) }), effort: NAMES[e.level - 1] }));
            return { title: task.title, list: task.projectId ? names.get(task.projectId) : undefined, choices };
        });
        if (!loaded) return;

        const answers = await decide(env, {
            kinds: { effort: "effort" },
            state: { task: { title: loaded.title, ...(loaded.list && { list: loaded.list }) }, their_choices: loaded.choices },
            questions: { effort: { type: "score", instructions: instructions.trimEnd(), levels: LEVELS } },
            userHash: await hashIdentifier(userId),
        });
        const level = answers.effort?.id == null ? null : Number(answers.effort.id) + 1;
        if (!level) return;

        // Only if nothing changed during the call: still unset, same title, no guess or "no thanks" yet.
        await withRls(db, userId, (tx) =>
            tx.update(tasks)
                .set({ effortGuess: level, effortGuessSource: "model", effortGuessAt: new Date().toISOString() })
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.title, loaded.title), isNull(tasks.effort), isNull(tasks.effortGuessSource))));
    } catch (error) {
        logger.warn("ai", "effort_guess_failed", { reason: error instanceof Error ? error.message.slice(0, 117) : "unknown_error" });
    }
}
