// The Effort Cadence guesses for a task from this person's own choices. A guess is never the task's `effort`: it is read
// (day load, quick-win ranking, the assistant) and becomes the value only on a tap. Pure.
import { suggestEffort, type EffortEvidence, type EffortLevel } from "@cadence/nlp/effort";
import type { LocalDate } from "./time";

export type EffortGuess = { level: EffortLevel; source: "similar" | "model"; support: number };

export interface GuessTask {
    effort: EffortLevel | null;
    effortGuess?: EffortLevel | null;
    effortGuessSource?: string | null;
    title: string;
    projectId: string | null;
}

/**
 * The task's Effort if chosen (no guess); else a single-level guess from this person's evidence; else null.
 * Never a range, never the middling fallback. A "no thanks" returns null until the title or list changes.
 */
export function effortGuessOf(task: GuessTask, evidence: readonly EffortEvidence[], today: LocalDate): EffortGuess | null {
    if (task.effort !== null || task.effortGuessSource === "dismissed") return null;
    if (task.effortGuessSource === "model" && task.effortGuess) return { level: task.effortGuess, source: "model", support: 0 };
    const s = suggestEffort(task.title, task.projectId, evidence, today);
    return s?.kind === "level" ? { level: s.level, source: "similar", support: s.support } : null;
}
