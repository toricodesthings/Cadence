/**
 * What the assistant is told about a task beyond its fields: how long it usually takes (`durationHints`) and an Effort
 * guess from this person's own choices. A guess is never the task's Effort, and it is left out when Effort suggestions are off.
 */
import { eq } from "drizzle-orm";
import { toEvidence } from "@cadence/domain/effort-evidence";
import { effortGuessOf } from "@cadence/domain/effort-guess";
import { todayIn, type LocalDate } from "@cadence/domain/time";
import type { EffortLevel } from "@cadence/contracts/task";
import { users } from "../../../db/schema";
import { userZone } from "../../../platform/user-zone";
import type { Tx } from "../../../types/db";
import { readEffortEvidence } from "../../tasks/tasks.service";
import { durationHints } from "./duration";

type GuessRow = {
    id: string; title: string; projectId: string | null; state: string; recurrenceRule: string | null; interactionMode: string;
    effort: number | null; effortGuess?: number | null; effortGuessSource?: string | null;
};
type HintRow = Parameters<typeof durationHints>[2][number] & GuessRow;
export type TaskHint = { takesAbout?: number; took?: number | string; effortGuess?: 1 | 2 | 3 };

/** Whether the person has Effort suggestions on (the same switch as the composer's). */
async function guessesOn(tx: Tx, userId: string): Promise<boolean> {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    const intelligence = (row?.settings as { tasks?: { intelligence?: { nlpEnabled?: boolean; effortSuggestions?: boolean } } } | null)?.tasks?.intelligence;
    return intelligence?.nlpEnabled !== false && intelligence?.effortSuggestions !== false;
}

/** Effort guesses for the open tasks among `rows`: the stored model guess, else a similar-choices match. No model call. */
export async function effortGuesses(tx: Tx, userId: string, rows: readonly GuessRow[], today?: LocalDate): Promise<Map<string, 1 | 2 | 3>> {
    const out = new Map<string, 1 | 2 | 3>();
    const open = rows.filter((r) => (r.state === "ACTIVE" || r.state === "WAITING") && r.effort == null && !r.recurrenceRule && r.interactionMode !== "timetable");
    if (!open.length || !(await guessesOn(tx, userId))) return out;
    const zone = await userZone(tx, userId);
    const evidence = toEvidence(await readEffortEvidence(tx, userId), zone);
    for (const r of open) {
        const guess = effortGuessOf({ ...r, effort: null, effortGuess: r.effortGuess as EffortLevel, effortGuessSource: r.effortGuessSource }, evidence, today ?? todayIn(zone));
        if (guess?.level) out.set(r.id, guess.level as 1 | 2 | 3);
    }
    return out;
}

/** Duration hints and Effort guesses together, keyed by task id. */
export async function taskHints(tx: Tx, userId: string, rows: readonly HintRow[], today?: LocalDate): Promise<Map<string, TaskHint>> {
    const hints: Map<string, TaskHint> = await durationHints(tx, userId, rows);
    for (const [id, level] of await effortGuesses(tx, userId, rows, today)) hints.set(id, { ...hints.get(id), effortGuess: level });
    return hints;
}
