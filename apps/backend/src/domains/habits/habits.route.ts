import { Hono } from "hono";
import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { resolveTimeZone } from "../../platform/date-utils";
import { addDaysToDate, isPausedOn, localDay } from "@cadence/domain/repeats";
import { habits, habitLogs, habitTags } from "../../db/schema";
import { insertHabitSchema, updateHabitSchema, resolveHabitActionSchema, weeklyHabitsQuerySchema, habitListQuerySchema } from "@cadence/contracts/habit";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { createHabit, expandOccurrences, resolveHabit, updateHabit } from "./habits.service";

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
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const habit = await withRls(db, userId, (tx) => createHabit(tx, userId, c.req.valid("json"), idempotencyKey));

        // Fetch tag IDs for the response
        const tags = await withRls(db, userId, async (tx) => {
            return tx.select({ tagId: habitTags.tagId }).from(habitTags).where(eq(habitTags.habitId, habit.id));
        });

        return c.json({ data: { ...habit, tagIds: tags.map(t => t.tagId) } }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateHabitSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, (tx) => updateHabit(tx, userId, id, c.req.valid("json")));

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
    .get("/weekly", apiValidator("query", weeklyHabitsQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { start, end, archived, timezone } = c.req.valid("query");
        const db = getDbClient(c.env);

        const startDate = new Date(`${start}T00:00:00.000Z`);
        const endDate = new Date(`${end}T23:59:59.999Z`);
        const tz = resolveTimeZone(timezone);
        const todayStr = localDay(new Date(), tz);

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
                // Shown from the day before the routine was created ("I did it
                // yesterday too"); earlier days only when they were logged.
                const firstDay = addDaysToDate(localDay(habit.createdAt, tz), -1);
                const dates = expandOccurrences(habit.recurrenceRule, habit.createdAt, startDate, endDate, tz)
                    .filter((dateKey) => dateKey >= firstDay || logsByHabitDate[`${habit.id}_${dateKey}`]);

                // Expand instances, respecting pause state
                const logsHydrated = dates
                    .filter(dateKey => !isPausedOn(habit.pausedUntil, dateKey, todayStr))
                    .map((dateKey) => {
                        const logKey = `${habit.id}_${dateKey}`;
                        const existingLog = logsByHabitDate[logKey];

                        return {
                            id: existingLog?.id || `virt_${dateKey}`,
                            habitId: habit.id,
                            status: existingLog?.status || "PENDING",
                            targetDate: dateKey,
                            completedAt: existingLog?.completedAt || null,
                            stepStatus: existingLog?.stepStatus ?? null,
                        };
                    });

                // Compute window summary
                const completedInWindow = logsHydrated.filter(l => l.status === "COMPLETED").length;
                const pendingInWindow = logsHydrated.filter(l => l.status === "PENDING").length;
                const scheduledInWindow = logsHydrated.length;
                const adherenceInWindow = scheduledInWindow > 0 ? completedInWindow / scheduledInWindow : 0;

                // Determine due-today and overdue status
                const isDueToday = dates.includes(todayStr) && !isPausedOn(habit.pausedUntil, todayStr, todayStr);
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
