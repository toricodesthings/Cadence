import type { Tx } from "../../../types/db";
import { habitOccurrences, isPausedOn } from "@cadence/domain/repeats";
import type { Zone } from "@cadence/domain/time";
import { loadHabitsForCaller, turnFor, turnOrderOf } from "../../habits/habits.service";

export async function readSnapshotRoutines(tx: Tx, userId: string, zone?: Zone) {
    const { rows } = await loadHabitsForCaller(tx, userId, { archived: false, zone });
    return rows
        .filter((row) => row.access !== "view")
        .slice(0, 50)
        .map((row) => ({
            id: row.id,
            userId: row.userId,
            callerId: userId,
            title: row.title,
            recurrenceRule: row.recurrenceRule,
            targetTime: row.targetTime,
            times: row.times,
            steps: row.steps,
            createdAt: row.createdAt,
            pausedUntil: row.pausedUntil,
            shareMode: row.shareMode,
            turnOrder: row.turnOrder,
            turnsFrom: row.turnsFrom,
            participants: row.participants,
        }));
}

export type SnapshotRoutineReader = (tx: Tx) => Promise<Awaited<ReturnType<typeof readSnapshotRoutines>>>;

export function routinesDue(
    rows: {
        id: string;
        userId?: string;
        callerId?: string;
        title: string;
        recurrenceRule: string;
        targetTime: string | null;
        times?: string[] | null;
        createdAt: string;
        pausedUntil: string | null;
        shareMode?: "together" | "turns" | null;
        turnOrder?: string[] | null;
        turnsFrom?: string | null;
        participants?: string[];
    }[],
    from: string,
    to: string,
    today: string,
    timeZone = "UTC",
) {
    return rows.flatMap((row) => {
        const order =
            row.shareMode === "turns" && row.participants?.length
                ? turnOrderOf({ userId: row.userId ?? "", turnOrder: row.turnOrder ?? null }, row.participants)
                : null;
        const days = habitOccurrences(row.recurrenceRule, String(row.createdAt), from, to, timeZone).filter(
            (day) =>
                !isPausedOn(row.pausedUntil, day, today) &&
                (!order ||
                    !row.callerId ||
                    turnFor(
                        {
                            recurrenceRule: row.recurrenceRule,
                            createdAt: row.createdAt,
                            turnsFrom: row.turnsFrom ?? null,
                        },
                        order,
                        day,
                        timeZone as Zone,
                    ) === row.callerId),
        );
        return days.length
            ? [
                  {
                      id: row.id,
                      title: row.title,
                      days,
                      ...(row.times?.length ? { times: row.times } : { targetTime: row.targetTime }),
                  },
              ]
            : [];
    });
}
