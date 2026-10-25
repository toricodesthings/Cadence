// When the assistant may ask "Which matters most today?" or "Which is heaviest?" again. Pure: the server runs it.
import { daysBetween, type LocalDate } from "./time";

export type FieldAskKind = "priority" | "effort";

export interface FieldAskEntry {
    lastOn: LocalDate | null;
    /** Questions in a row they typed past. */
    misses: number;
    /** The options of the question still waiting for its reply. */
    labels?: string[];
}

/** `users.settings.assistant.fieldAsk`: server-owned, written only by `ask_user` and the turn that answers it. */
export type FieldAskState = Partial<Record<FieldAskKind, FieldAskEntry>>;

/** Answered: ask again whenever it helps. One miss: 7 days. Two in a row: 30. */
export function fieldAskOpen(entry: FieldAskEntry | undefined, today: LocalDate): boolean {
    if (!entry?.lastOn || entry.misses === 0) return true;
    return daysBetween(entry.lastOn, today) >= (entry.misses >= 2 ? 30 : 7);
}

const fold = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Their next message settles a waiting question: one of its options answers it, anything else is a miss.
 * Null when nothing waited; `answered` names the field whose question the message answered.
 */
export function settleFieldAsk(state: FieldAskState | null | undefined, reply: string): { state: FieldAskState; answered?: FieldAskKind } | null {
    if (!state || !reply.trim()) return null;
    const said = fold(reply);
    let next: FieldAskState | null = null;
    let answered: FieldAskKind | undefined;
    for (const kind of ["priority", "effort"] as const) {
        const entry = state[kind];
        if (!entry?.labels) continue;
        // A typed reply naming an option ("the essay") answers it too.
        const hit = entry.labels.some((label) => fold(label) === said || said.includes(fold(label)));
        if (hit) answered = kind;
        next = { ...(next ?? state), [kind]: { lastOn: entry.lastOn, misses: hit ? 0 : entry.misses + 1 } };
    }
    return next && { state: next, ...(answered && { answered }) };
}
