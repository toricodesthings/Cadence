/** The bounded routine rows shared by schedule and status projections. */
import { and, eq } from "drizzle-orm";
import { habits } from "../../../db/schema";
import type { Tx } from "../../../types/db";
import { isPausedOn } from "@cadence/domain/repeats";
import { expandOccurrences } from "../../habits/habits.service";

export function readSnapshotRoutines(tx: Tx, userId: string) {
    return tx.select({
        id: habits.id, title: habits.title, recurrenceRule: habits.recurrenceRule,
        targetTime: habits.targetTime, times: habits.times, steps: habits.steps,
        createdAt: habits.createdAt, pausedUntil: habits.pausedUntil,
    }).from(habits).where(and(eq(habits.userId, userId), eq(habits.archived, false)))
        .orderBy(habits.sortOrder).limit(50);
}

export type SnapshotRoutineReader = (tx: Tx) => Promise<Awaited<ReturnType<typeof readSnapshotRoutines>>>;

/** Routines with the days they're due in [from, to], skipping paused days; none due → left out. */
export function routinesDue(
    rows: { id: string; title: string; recurrenceRule: string; targetTime: string | null; times?: string[] | null; createdAt: string; pausedUntil: string | null }[],
    from: string,
    to: string,
    today: string,
    timeZone = "UTC",
) {
    return rows.flatMap((row) => {
        const days = expandOccurrences(row.recurrenceRule, row.createdAt, from, to, timeZone)
            .filter((day) => !isPausedOn(row.pausedUntil, day, today));
        // A routine at set times reports them instead of one usual time.
        return days.length ? [{ id: row.id, title: row.title, days, ...(row.times?.length ? { times: row.times } : { targetTime: row.targetTime }) }] : [];
    });
}

