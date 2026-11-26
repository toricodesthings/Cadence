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

export function effortGuessOf(
    task: GuessTask,
    evidence: readonly EffortEvidence[],
    today: LocalDate,
): EffortGuess | null {
    if (task.effort !== null || task.effortGuessSource === "dismissed") return null;
    if (task.effortGuessSource === "model" && task.effortGuess)
        return { level: task.effortGuess, source: "model", support: 0 };
    const s = suggestEffort(task.title, task.projectId, evidence, today);
    return s?.kind === "level" ? { level: s.level, source: "similar", support: s.support } : null;
}
