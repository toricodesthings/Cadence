import { daysBetween, type LocalDate } from "./time";

export type FieldAskKind = "priority" | "effort";

export interface FieldAskEntry {
    lastOn: LocalDate | null;
    misses: number;
    labels?: string[];
}

export type FieldAskState = Partial<Record<FieldAskKind, FieldAskEntry>>;

export function fieldAskOpen(entry: FieldAskEntry | undefined, today: LocalDate): boolean {
    if (!entry?.lastOn || entry.misses === 0) return true;
    return daysBetween(entry.lastOn, today) >= (entry.misses >= 2 ? 30 : 7);
}

const fold = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export function settleFieldAsk(
    state: FieldAskState | null | undefined,
    reply: string,
): { state: FieldAskState; answered?: FieldAskKind } | null {
    if (!state || !reply.trim()) return null;
    const said = fold(reply);
    let next: FieldAskState | null = null;
    let answered: FieldAskKind | undefined;
    for (const kind of ["priority", "effort"] as const) {
        const entry = state[kind];
        if (!entry?.labels) continue;
        const hit = entry.labels.some((label) => fold(label) === said || said.includes(fold(label)));
        if (hit) answered = kind;
        next = { ...(next ?? state), [kind]: { lastOn: entry.lastOn, misses: hit ? 0 : entry.misses + 1 } };
    }
    return next && { state: next, ...(answered && { answered }) };
}
