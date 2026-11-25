import { and, eq } from "drizzle-orm";
import { habitOccurrences } from "@cadence/domain/repeats";
import { addDays, type LocalDate, type Zone } from "@cadence/domain/time";
import type { RoutineAccess } from "../../platform/list-access";
import { habits } from "../../db/schema";
import type { Tx } from "../../types/db";

export const turnHabitFrom = (access: RoutineAccess) => ({
    id: access.habitId,
    userId: access.ownerId,
    recurrenceRule: access.recurrenceRule,
    createdAt: access.createdAt,
    turnOrder: access.turnOrder,
    turnsFrom: access.turnsFrom,
});

/**
 * Resolve the effective turn order for a turns-mode routine: drops departed ids and appends missing participants
 * in their stable order (owner first, then members by joined_at).
 */
export function turnOrderOf(
    habit: { userId: string; turnOrder: string[] | null },
    participants: readonly string[],
): string[] {
    const allowed = new Set(participants);
    const base = (habit.turnOrder ?? []).filter((id) => allowed.has(id));
    const seen = new Set(base);
    for (const id of participants) {
        if (!seen.has(id)) {
            base.push(id);
            seen.add(id);
        }
    }
    return base;
}

/**
 * Pure turn calculation (R6): whose turn it is for due day `date`.
 * `k` = number of occurrences from `turnsFrom` through `date`; holder is `order[(k - 1) mod n]`.
 */
export function turnFor(
    habit: { recurrenceRule: string; createdAt: string; turnsFrom: string | null },
    order: readonly string[],
    date: LocalDate,
    zone: Zone,
): string | null {
    const n = order.length;
    if (n === 0) return null;
    if (!habit.turnsFrom) return order[0] ?? null;

    if (date >= habit.turnsFrom) {
        const occurrences = habitOccurrences(
            habit.recurrenceRule,
            String(habit.createdAt),
            habit.turnsFrom,
            date,
            zone,
        );
        const k = occurrences.length;
        if (k === 0) return order[0] ?? null;
        return order[(k - 1) % n] ?? null;
    }

    const before = habitOccurrences(
        habit.recurrenceRule,
        String(habit.createdAt),
        date,
        addDays(habit.turnsFrom, -1),
        zone,
    );
    const k = before.length;
    return order[((-k % n) + n) % n] ?? null;
}

type TurnHabit = {
    userId: string;
    recurrenceRule: string;
    createdAt: string;
    turnOrder: string[] | null;
    turnsFrom: string | null;
};

/**
 * Re-anchor turn order after a membership or mode change so today's turn holder (if still in) stays first.
 */
export function reanchoredOrder(
    habit: TurnHabit,
    oldParticipants: readonly string[],
    newParticipants: readonly string[],
    today: LocalDate,
    zone: Zone,
): string[] {
    const prevOrder = turnOrderOf(habit, oldParticipants);
    const todayHolder = habit.turnsFrom ? turnFor(habit, prevOrder, today, zone) : (prevOrder[0] ?? null);
    const next = turnOrderOf({ userId: habit.userId, turnOrder: prevOrder }, newParticipants);
    if (todayHolder) {
        const idx = next.indexOf(todayHolder);
        if (idx > 0) return [...next.slice(idx), ...next.slice(0, idx)];
    }
    return next;
}

/** Persist a re-anchored turn order and today's anchor on the habit row. */
export async function reorderTurns(
    tx: Tx,
    habit: TurnHabit & { id: string },
    oldParticipants: readonly string[],
    newParticipants: readonly string[],
    today: LocalDate,
    zone: Zone,
): Promise<string[]> {
    const next = reanchoredOrder(habit, oldParticipants, newParticipants, today, zone);
    await tx
        .update(habits)
        .set({ turnOrder: next, turnsFrom: today })
        .where(and(eq(habits.id, habit.id), eq(habits.userId, habit.userId)));
    return next;
}
