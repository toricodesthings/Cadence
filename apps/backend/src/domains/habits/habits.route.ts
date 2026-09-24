import { Hono } from "hono";
import { eq, and, inArray, gte, lte, sql, desc, isNull, or } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { checkIdempotency, getIdempotencyKey, recordMutation } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { withRls } from "../../platform/rls";
import { toLocalDateStr } from "../../platform/date-utils";
import { habits, habitLogs, habitTags } from "../../db/schema";
import { insertHabitSchema, updateHabitSchema, resolveHabitActionSchema, weeklyHabitsQuerySchema, monthlyHabitsQuerySchema, habitListQuerySchema, unresolvedQuerySchema } from "@cadence/contracts/habit";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound, assertNoConflict } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { expandOccurrences, resolveHabit } from "./habits.service";

/** Check if a habit is paused for a given date */
function isHabitPaused(habit: { pausedUntil: string | null }, dateStr: string): boolean {
    if (!habit.pausedUntil) return false;
    return dateStr <= habit.pausedUntil;
}

export const habitRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/:id/resolve", apiValidator("param", uuidParamSchema), apiValidator("json", resolveHabitActionSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const result = await withRls(db, userId, (tx) => resolveHabit(tx, userId, id, body));

        return c.json({ data: result }, 200);
    })
    .post("/", apiValidator("json", insertHabitSchema), async (c) => {
        const userId = c.get("userId");
        const { tagIds, ...body } = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const habit = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(habits).where(and(eq(habits.id, existingId), eq(habits.userId, userId)));
                if (existing) return existing;
            }

            await assertOwnership(tx, userId, { projectId: body.projectId, tagIds });

            const [row] = await tx
                .insert(habits)
                .values({ ...body, userId })
                .returning();

            // Insert tag associations if provided
            if (tagIds && tagIds.length > 0) {
                await tx.insert(habitTags).values(
                    tagIds.map((tagId) => ({ habitId: row.id, tagId, userId }))
                );
            }

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        // Fetch tag IDs for the response
        const tags = await withRls(db, userId, async (tx) => {
            return tx.select({ tagId: habitTags.tagId }).from(habitTags).where(eq(habitTags.habitId, habit.id));
        });

        return c.json({ data: { ...habit, tagIds: tags.map(t => t.tagId) } }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateHabitSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { expectedUpdatedAt, tagIds, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            if (expectedUpdatedAt) {
                const [existing] = await tx
                    .select({ updatedAt: habits.updatedAt })
                    .from(habits)
                    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
                throwIfNotFound(existing, "Habit");
                assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Habit");
            }

            await assertOwnership(tx, userId, { projectId: body.projectId, tagIds });

            const [row] = await tx
                .update(habits)
                .set({ ...body, updatedAt: sql`NOW()` })
                .where(and(eq(habits.id, id), eq(habits.userId, userId)))
                .returning();

            // Abort inside the transaction when the habit is not owned, so the
            // tag mutations below never commit against another user's habit id.
            throwIfNotFound(row, "Habit");

            // Sync tag associations if provided
            if (tagIds !== undefined) {
                await tx.delete(habitTags).where(eq(habitTags.habitId, id));
                if (tagIds.length > 0) {
                    await tx.insert(habitTags).values(
                        tagIds.map((tagId) => ({ habitId: id, tagId, userId }))
                    );
                }
            }

            return row;
        });

        throwIfNotFound(updated, "Habit");

        // Fetch current tag IDs
        const tags = await withRls(db, userId, async (tx) => {
            return tx.select({ tagId: habitTags.tagId }).from(habitTags).where(eq(habitTags.habitId, id));
        });

        return c.json({ data: { ...updated, tagIds: tags.map(t => t.tagId) } });
    })
    // Base list parity: `/` and `/weekly` both use the same `archived` semantics.
    .get("/", apiValidator("query", habitListQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { archived } = c.req.valid("query");
        const db = getDbClient(c.env);

        const allHabits = await withRls(db, userId, async (tx) => {
            return tx
                .select()
                .from(habits)
                .where(and(eq(habits.userId, userId), eq(habits.archived, archived)))
                .orderBy(desc(habits.createdAt));
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: allHabits });
    })
    .get("/unresolved", apiValidator("query", unresolvedQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { timezone } = c.req.valid("query");
        const db = getDbClient(c.env);

        const result = await withRls(db, userId, async (tx) => {
            // Compute today in the caller's local timezone so habits are not
            // prematurely flagged or resolved due to UTC date drift.
            const tz = timezone || "UTC";
            const now = new Date();
            const todayStr = toLocalDateStr(now, tz);

            const activeHabits = await tx
                .select()
                .from(habits)
                .where(and(
                    eq(habits.userId, userId),
                    eq(habits.archived, false),
                    or(isNull(habits.pausedUntil), lte(habits.pausedUntil, todayStr))
                ));

            if (activeHabits.length === 0) return [];

            // Today only: a missed routine lets go, it is never carried over.
            const windowStart = new Date(`${todayStr}T00:00:00.000Z`);
            const windowEnd = new Date(`${todayStr}T23:59:59.999Z`);

            // Fetch existing logs in the window
            const habitIds = activeHabits.map(h => h.id);
            const logs = await tx
                .select()
                .from(habitLogs)
                .where(and(
                    eq(habitLogs.userId, userId),
                    inArray(habitLogs.habitId, habitIds),
                    gte(habitLogs.targetDate, todayStr),
                    lte(habitLogs.targetDate, todayStr),
                ));

            const resolvedSet = new Set(
                logs
                    .filter(l => l.status === "COMPLETED" || l.status === "SKIPPED")
                    .map(l => `${l.habitId}_${l.targetDate}`)
            );

            // For each habit, expand occurrences in the window and find unresolved ones
            const unresolvedItems: Array<{
                habitId: string;
                title: string;
                targetTime: string | null;
                latestTargetDate: string;
                missedCount: number;
                actionableDates: string[];
            }> = [];

            for (const habit of activeHabits) {
                const dates = expandOccurrences(habit.recurrenceRule, habit.createdAt, windowStart, windowEnd);
                const actionableDates = dates.filter(d => !resolvedSet.has(`${habit.id}_${d}`) && !isHabitPaused(habit, d));

                if (actionableDates.length > 0) {
                    unresolvedItems.push({
                        habitId: habit.id,
                        title: habit.title,
                        targetTime: habit.targetTime,
                        latestTargetDate: actionableDates[actionableDates.length - 1],
                        missedCount: actionableDates.length,
                        actionableDates,
                    });
                }
            }

            return unresolvedItems;
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: result });
    })
    .get("/weekly", apiValidator("query", weeklyHabitsQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { start, end, archived, timezone } = c.req.valid("query");
        const db = getDbClient(c.env);

        const startDate = new Date(`${start}T00:00:00.000Z`);
        const endDate = new Date(`${end}T23:59:59.999Z`);
        const todayStr = toLocalDateStr(new Date(), timezone);

        const result = await withRls(db, userId, async (tx) => {
            const userHabits = await tx
                .select()
                .from(habits)
                .where(and(
                    eq(habits.userId, userId),
                    eq(habits.archived, archived || false)
                ));

            if (userHabits.length === 0) return [];

            const habitIds = userHabits.map((h) => h.id);

            const logs = await tx
                .select()
                .from(habitLogs)
                .where(
                    and(
                        eq(habitLogs.userId, userId),
                        inArray(habitLogs.habitId, habitIds),
                        gte(habitLogs.targetDate, start),
                        lte(habitLogs.targetDate, end),
                    )
                );

            // Fetch tag associations for all habits in batch
            const allTags = await tx
                .select({ habitId: habitTags.habitId, tagId: habitTags.tagId })
                .from(habitTags)
                .where(inArray(habitTags.habitId, habitIds));

            const tagsByHabit = new Map<string, string[]>();
            for (const t of allTags) {
                const arr = tagsByHabit.get(t.habitId) || [];
                arr.push(t.tagId);
                tagsByHabit.set(t.habitId, arr);
            }

            const logsByHabitDate: Record<string, typeof logs[0]> = {};
            for (const log of logs) {
                logsByHabitDate[`${log.habitId}_${log.targetDate}`] = log;
            }

            return userHabits.map((habit) => {
                const dates = expandOccurrences(habit.recurrenceRule, habit.createdAt, startDate, endDate);

                // Expand instances, respecting pause state
                const logsHydrated = dates
                    .filter(dateKey => !isHabitPaused(habit, dateKey))
                    .map((dateKey) => {
                        const logKey = `${habit.id}_${dateKey}`;
                        const existingLog = logsByHabitDate[logKey];

                        return {
                            id: existingLog?.id || `virt_${dateKey}`,
                            habitId: habit.id,
                            status: existingLog?.status || "PENDING",
                            targetDate: dateKey,
                            completedAt: existingLog?.completedAt || null,
                        };
                    });

                // Compute window summary
                const completedInWindow = logsHydrated.filter(l => l.status === "COMPLETED").length;
                const pendingInWindow = logsHydrated.filter(l => l.status === "PENDING").length;
                const scheduledInWindow = logsHydrated.length;
                const adherenceInWindow = scheduledInWindow > 0 ? completedInWindow / scheduledInWindow : 0;

                // Determine due-today and overdue status
                const isDueToday = dates.includes(todayStr) && !isHabitPaused(habit, todayStr);
                const isOverdue = logsHydrated.some(l =>
                    l.status === "PENDING" && l.targetDate < todayStr
                );

                return {
                    ...habit,
                    tagIds: tagsByHabit.get(habit.id) || [],
                    logs: logsHydrated,
                    isDueToday,
                    isOverdue,
                    pendingCountInWindow: pendingInWindow,
                    completedCountInWindow: completedInWindow,
                    scheduledCountInWindow: scheduledInWindow,
                    adherenceRateInWindow: Math.round(adherenceInWindow * 100) / 100,
                };
            });
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: result });
    })
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const habit = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .select()
                .from(habits)
                .where(and(eq(habits.id, id), eq(habits.userId, userId)));
            return row;
        });

        throwIfNotFound(habit, "Habit");

        return c.json({ data: habit });
    })
    /** Return all habit logs for a given calendar month (for the heatmap calendar). */
    .get("/:id/monthly", apiValidator("param", uuidParamSchema), apiValidator("query", monthlyHabitsQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { year, month } = c.req.valid("query");
        const db = getDbClient(c.env);

        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month, daysInMonth, 23, 59, 59, 999));
        const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

        const result = await withRls(db, userId, async (tx) => {
            const [habit] = await tx
                .select()
                .from(habits)
                .where(and(eq(habits.id, id), eq(habits.userId, userId)));

            throwIfNotFound(habit, "Habit");

            const logs = await tx
                .select()
                .from(habitLogs)
                .where(
                    and(
                        eq(habitLogs.habitId, id),
                        eq(habitLogs.userId, userId),
                        gte(habitLogs.targetDate, startStr),
                        lte(habitLogs.targetDate, endStr)
                    )
                );

            // Use shared recurrence expansion
            const scheduledDates = expandOccurrences(habit.recurrenceRule, habit.createdAt, startDate, endDate);
            const scheduledDays = scheduledDates.map((d) => parseInt(d.substring(8, 10), 10));

            const logsByDay: Record<number, string> = {};
            for (const log of logs) {
                const day = parseInt(log.targetDate.substring(8, 10), 10);
                logsByDay[day] = log.status;
            }

            return { scheduledDays, logsByDay };
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: result });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const deleted = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .delete(habits)
                .where(and(eq(habits.id, id), eq(habits.userId, userId)))
                .returning();
            return row;
        });

        throwIfNotFound(deleted, "Habit");
        return c.json({ data: deleted });
    });
