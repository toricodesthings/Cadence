import { Hono } from "hono";
import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { resolveTimeZone } from "../../platform/date-utils";
import { localDay } from "@cadence/domain/repeats";
import { habits, habitLogs, habitTags } from "../../db/schema";
import { insertHabitSchema, updateHabitSchema, resolveHabitActionSchema, weeklyHabitsQuerySchema, habitListQuerySchema } from "@cadence/contracts/habit";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { createHabit, deleteHabit, habitDays, resolveHabit, updateHabit } from "./habits.service";

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

            const logsByHabit = new Map<string, Map<string, (typeof logs)[number]>>();
            for (const log of logs) {
                if (!logsByHabit.has(log.habitId)) logsByHabit.set(log.habitId, new Map());
                logsByHabit.get(log.habitId)!.set(log.targetDate, log);
            }

            return userHabits.map((habit) => {
                const days = habitDays(habit, logsByHabit.get(habit.id) ?? new Map(), start, end, tz, todayStr);
                const logsHydrated = days.map(({ date: dateKey, log: existingLog }) => ({
                    id: existingLog?.id || `virt_${dateKey}`,
                    habitId: habit.id,
                    status: existingLog?.status || "PENDING",
                    targetDate: dateKey,
                    completedAt: existingLog?.completedAt || null,
                    stepStatus: existingLog?.stepStatus ?? null,
                }));

                // Compute window summary
                const completedInWindow = logsHydrated.filter(l => l.status === "COMPLETED").length;
                const pendingInWindow = logsHydrated.filter(l => l.status === "PENDING").length;
                const scheduledInWindow = logsHydrated.length;
                const adherenceInWindow = scheduledInWindow > 0 ? completedInWindow / scheduledInWindow : 0;

                // Determine due-today and overdue status
                const isDueToday = days.some((day) => day.date === todayStr);
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

        const deleted = await withRls(db, userId, (tx) => deleteHabit(tx, userId, id));
        return c.json({ data: deleted });
    });
