import { Hono } from "hono";
import { eq, and, inArray, gte, lte, sql, desc, isNull, or } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { checkIdempotency, recordMutation } from "../lib/idempotency";
import { withRls } from "../lib/rls";
import { habits, habitLogs, habitTags } from "../db/schema";
import { insertHabitSchema, updateHabitSchema, resolveHabitActionSchema, weeklyHabitsQuerySchema, monthlyHabitsQuerySchema, habitListQuerySchema, unresolvedQuerySchema } from "../types/habit";
import { uuidParamSchema } from "../types/common";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError, throwIfNotFound, assertNoConflict } from "../lib/errors";
import { rrulestr } from "rrule";
import { parseISO } from "date-fns";
import { apiValidator } from "../lib/validation";

/**
 * Shared recurrence expansion — single source of truth.
 * Anchors dtstart to midnight UTC of the habit's creation date, then expands
 * within the given [startDate, endDate] window returning YYYY-MM-DD strings.
 */
function expandOccurrences(recurrenceRule: string, createdAt: string, startDate: Date, endDate: Date): string[] {
    try {
        const dtstart = new Date(`${String(createdAt).substring(0, 10)}T00:00:00.000Z`);
        const rule = rrulestr(recurrenceRule, { dtstart });
        const instances = rule.between(startDate, endDate, true);
        return instances.map((d) => d.toISOString().substring(0, 10));
    } catch (e) {
        console.error("Invalid recurrence rule", recurrenceRule, e);
        return [];
    }
}

/**
 * Deterministic streak recomputation from habit log history.
 * Walks backward from the most recent completed date.
 */
function recomputeStreaks(
    logs: Array<{ targetDate: string; status: string }>,
    occurrenceDates: string[],
): { currentStreak: number; longestStreak: number; totalCompletions: number; totalSkips: number } {
    const logByDate = new Map<string, string>();
    let totalCompletions = 0;
    let totalSkips = 0;
    for (const log of logs) {
        logByDate.set(log.targetDate, log.status);
        if (log.status === "COMPLETED") totalCompletions++;
        if (log.status === "SKIPPED") totalSkips++;
    }

    // Sort occurrence dates descending for streak computation
    const sorted = [...occurrenceDates].sort((a, b) => b.localeCompare(a));
    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    for (const date of sorted) {
        const status = logByDate.get(date);
        if (status === "COMPLETED") {
            streak++;
        } else {
            if (streak > longestStreak) longestStreak = streak;
            // Current streak is only from the most recent unbroken run
            if (currentStreak === 0) currentStreak = streak;
            streak = 0;
        }
    }
    if (streak > longestStreak) longestStreak = streak;
    if (currentStreak === 0) currentStreak = streak;

    return { currentStreak, longestStreak, totalCompletions, totalSkips };
}

/** Check if a habit is paused for a given date */
function isHabitPaused(habit: { pausedUntil: string | null }, dateStr: string): boolean {
    if (!habit.pausedUntil) return false;
    return dateStr <= habit.pausedUntil;
}

export const habitRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", insertHabitSchema), async (c) => {
        const userId = c.get("userId");
        const { clientMutationId, tagIds, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        const habit = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, clientMutationId);
            if (existingId) {
                const [existing] = await tx.select().from(habits).where(and(eq(habits.id, existingId), eq(habits.userId, userId)));
                if (existing) return existing;
            }

            // Auto-promote targetMode when targetTime is provided
            const targetMode = body.targetTime && (!body.targetMode || body.targetMode === "AMBIENT")
                ? "ANCHOR" : (body.targetMode ?? "AMBIENT");

            const [row] = await tx
                .insert(habits)
                .values({ ...body, targetMode, userId })
                .returning();

            // Insert tag associations if provided
            if (tagIds && tagIds.length > 0) {
                await tx.insert(habitTags).values(
                    tagIds.map((tagId) => ({ habitId: row.id, tagId, userId }))
                );
            }

            await recordMutation(tx, userId, clientMutationId, row.id);
            return row;
        });

        // Fetch tag IDs for the response
        const tags = await withRls(db, userId, async (tx) => {
            return tx.select({ tagId: habitTags.tagId }).from(habitTags).where(eq(habitTags.habitId, habit.id));
        });

        return c.json({ data: { ...habit, tagIds: tags.map(t => t.tagId) } }, 201);
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
            // Get active, unpaused habits
            const todayStr = new Date().toISOString().substring(0, 10);
            const yesterdayDate = new Date();
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayStr = yesterdayDate.toISOString().substring(0, 10);

            const activeHabits = await tx
                .select()
                .from(habits)
                .where(and(
                    eq(habits.userId, userId),
                    eq(habits.archived, false),
                    or(isNull(habits.pausedUntil), lte(habits.pausedUntil, todayStr))
                ));

            if (activeHabits.length === 0) return [];

            // Recovery window: yesterday and today
            const windowStart = new Date(`${yesterdayStr}T00:00:00.000Z`);
            const windowEnd = new Date(`${todayStr}T23:59:59.999Z`);

            // Fetch existing logs in the window
            const habitIds = activeHabits.map(h => h.id);
            const logs = await tx
                .select()
                .from(habitLogs)
                .where(and(
                    eq(habitLogs.userId, userId),
                    inArray(habitLogs.habitId, habitIds),
                    gte(habitLogs.targetDate, yesterdayStr),
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
                targetMode: string;
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
                        targetMode: habit.targetMode,
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
        const { start, end, archived } = c.req.valid("query");
        const db = getDbClient(c.env);

        const startDate = new Date(`${start}T00:00:00.000Z`);
        const endDate = new Date(`${end}T23:59:59.999Z`);
        const todayStr = new Date().toISOString().substring(0, 10);

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
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateHabitSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { expectedUpdatedAt, tagIds, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        // Auto-promote targetMode when targetTime is provided
        if (body.targetTime && (!body.targetMode || body.targetMode === "AMBIENT")) {
            body.targetMode = "ANCHOR";
        }

        const updated = await withRls(db, userId, async (tx) => {
            if (expectedUpdatedAt) {
                const [existing] = await tx
                    .select({ updatedAt: habits.updatedAt })
                    .from(habits)
                    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
                throwIfNotFound(existing, "Habit");
                assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Habit");
            }

            const [row] = await tx
                .update(habits)
                .set({ ...body, updatedAt: sql`NOW()` })
                .where(and(eq(habits.id, id), eq(habits.userId, userId)))
                .returning();

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
    .post("/:id/resolve", apiValidator("param", uuidParamSchema), apiValidator("json", resolveHabitActionSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { targetDate, status } = c.req.valid("json");
        const db = getDbClient(c.env);

        const result = await withRls(db, userId, async (tx) => {
            const [habit] = await tx
                .select()
                .from(habits)
                .where(and(eq(habits.id, id), eq(habits.userId, userId)));

            throwIfNotFound(habit, "Habit");

            const datePrefix = targetDate.substring(0, 10);
            const now = sql`NOW()`;

            // Upsert by habitId + targetDate (unique constraint handles dedup)
            const [existing] = await tx
                .select()
                .from(habitLogs)
                .where(
                    and(
                        eq(habitLogs.userId, userId),
                        eq(habitLogs.habitId, habit.id),
                        eq(habitLogs.targetDate, datePrefix)
                    )
                );

            let row;
            if (status === "PENDING" && existing) {
                // Clearing a resolution — delete the log row to avoid noisy PENDING accumulation
                await tx.delete(habitLogs).where(eq(habitLogs.id, existing.id));
                row = { ...existing, status: "PENDING" as const, completedAt: null, resolvedAt: null };
            } else if (existing) {
                [row] = await tx
                    .update(habitLogs)
                    .set({
                        status,
                        completedAt: status === "COMPLETED" ? now : null,
                        resolvedAt: now,
                    })
                    .where(eq(habitLogs.id, existing.id))
                    .returning();
            } else if (status !== "PENDING") {
                [row] = await tx
                    .insert(habitLogs)
                    .values({
                        userId,
                        habitId: habit.id,
                        targetDate: datePrefix,
                        status,
                        completedAt: status === "COMPLETED" ? now : null,
                        resolvedAt: now,
                    })
                    .returning();
            } else {
                // PENDING with no existing log — no-op
                row = { id: `virt_${datePrefix}`, habitId: habit.id, userId, status: "PENDING" as const, targetDate: datePrefix, completedAt: null, resolvedAt: null, createdAt: new Date().toISOString() };
            }

            // Deterministic streak recomputation from full history
            const allLogs = await tx
                .select({ targetDate: habitLogs.targetDate, status: habitLogs.status })
                .from(habitLogs)
                .where(and(eq(habitLogs.habitId, habit.id), eq(habitLogs.userId, userId)));

            // Expand all occurrences from creation to today for streak calculation
            const totalExpansionEnd = new Date(`${new Date().toISOString().substring(0, 10)}T23:59:59.999Z`);
            const totalExpansionStart = new Date(`${String(habit.createdAt).substring(0, 10)}T00:00:00.000Z`);
            const allOccurrences = expandOccurrences(habit.recurrenceRule, habit.createdAt, totalExpansionStart, totalExpansionEnd);

            const streakData = recomputeStreaks(allLogs, allOccurrences);

            const [updatedHabit] = await tx
                .update(habits)
                .set({
                    totalCompletions: streakData.totalCompletions,
                    totalSkips: streakData.totalSkips,
                    currentStreak: streakData.currentStreak,
                    longestStreak: streakData.longestStreak,
                    updatedAt: now,
                })
                .where(eq(habits.id, habit.id))
                .returning();

            return { habit: updatedHabit, log: row };
        });

        return c.json({ data: result }, 200);
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
