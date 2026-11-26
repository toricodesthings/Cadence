import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { formatInZone, todayIn } from "@cadence/domain/time";
import { aiMemories, aiMemorySignals, habits } from "../../../db/schema";
import type { Tx } from "../../../types/db";
import { usableBy } from "./memory-store";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { userZone } from "../../../platform/user-zone";
import { logger, issuesFromError } from "../../../platform/log";
import type { Env } from "../../../types/env";
import { isLearning, memoryStateOf, readMemoryState } from "./memory-mode";
import { completionBucket, slotBucket } from "./signals";

export function memoryIsOn(settings: unknown): boolean {
    return isLearning(memoryStateOf(settings).mode);
}

export type PersonActivity =
    | { kind: "reschedule"; taskId: string; from: { scheduledStart: string | null; dueDate: string | null } }
    | { kind: "complete" }
    | { kind: "routine"; habitId: string; day: string };

export const MAX_SIGNALS_PER_DAY = 150;

export async function recordPersonActivity(
    env: Env,
    userId: string,
    activities: PersonActivity[],
    now: Date = new Date(),
): Promise<void> {
    if (activities.length === 0) return;
    try {
        await withRls(getDbClient(env), userId, async (tx) => {
            if ((await readMemoryState(tx, userId)).mode !== "full") return;
            const zone = await userZone(tx, userId);
            const today = todayIn(zone, now);
            const rows: (typeof aiMemorySignals.$inferInsert)[] = [];
            for (const activity of activities) {
                if (activity.kind === "reschedule") {
                    const bucket = slotBucket(activity.from, zone);
                    if (bucket) rows.push({ userId, kind: "reschedule", on: today, bucket, taskId: activity.taskId });
                } else if (activity.kind === "complete") {
                    rows.push({
                        userId,
                        kind: "complete",
                        on: today,
                        bucket: completionBucket(now.toISOString(), zone),
                    });
                } else if (activity.kind === "routine") {
                    const [habit] = await tx
                        .select({ title: habits.title })
                        .from(habits)
                        .where(and(eq(habits.id, activity.habitId), eq(habits.userId, userId)));
                    if (!habit) continue;
                    rows.push({
                        userId,
                        kind: "routine",
                        on: activity.day,
                        bucket: `${formatInZone(activity.day, "UTC", { weekday: "long" }, "en-US").toLowerCase()}|day`,
                        subject: habit.title.slice(0, 40),
                    });
                }
            }
            if (rows.length) {
                const [{ n }] = await tx
                    .select({ n: sql<number>`count(*)::int` })
                    .from(aiMemorySignals)
                    .where(and(eq(aiMemorySignals.userId, userId), eq(aiMemorySignals.on, today)));
                const room = Math.max(0, MAX_SIGNALS_PER_DAY - n);
                if (room > 0) await tx.insert(aiMemorySignals).values(rows.slice(0, room));
            }
        });
    } catch (error) {
        logger.warn("ai", "memory_signal_failed", { issues: issuesFromError(error) });
    }
}
export { pruneRoutineReports } from "./duration";
export { scheduleLearn } from "./queue";
export { readMemoryState } from "./memory-mode";

export async function planningSaid(tx: Tx, userId: string, maxChars: number): Promise<string> {
    const { mode } = await readMemoryState(tx, userId);
    if (!isLearning(mode)) return "";
    const rows = await tx
        .select({ content: aiMemories.content })
        .from(aiMemories)
        .where(and(usableBy(userId, mode), inArray(aiMemories.kind, ["preference", "constraint"])))
        .orderBy(desc(aiMemories.pinned), desc(aiMemories.updatedAt))
        .limit(10);
    return rows
        .map((m) => m.content)
        .join(" · ")
        .slice(0, maxChars);
}
