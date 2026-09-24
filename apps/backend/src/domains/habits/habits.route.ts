import { Hono } from "hono";
import { eq, and, inArray, gte, lte, sql, desc } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { checkIdempotency, getIdempotencyKey, recordMutation } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { withRls } from "../../platform/rls";
import { addDaysToDateStr, resolveTimeZone, toLocalDateStr } from "../../platform/date-utils";
import { habits, habitLogs, habitTags } from "../../db/schema";
import { localDay } from "@cadence/domain/repeats";
import { insertHabitSchema, updateHabitSchema, resolveHabitActionSchema, weeklyHabitsQuerySchema, habitListQuerySchema } from "@cadence/contracts/habit";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound, assertNoConflict } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { expandOccurrences, resolveHabit } from "./habits.service";

/** A pause covers today through `pausedUntil`; it never hides a day already past. */
function isHabitPaused(habit: { pausedUntil: string | null }, dateStr: string, todayStr: string): boolean {
    return Boolean(habit.pausedUntil) && dateStr >= todayStr && dateStr <= habit.pausedUntil!;
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
    .get("/weekly", apiValidator("query", weeklyHabitsQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { start, end, archived, timezone } = c.req.valid("query");
        const db = getDbClient(c.env);

        const startDate = new Date(`${start}T00:00:00.000Z`);
        const endDate = new Date(`${end}T23:59:59.999Z`);
        const tz = resolveTimeZone(timezone);
        const todayStr = toLocalDateStr(new Date(), tz);

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
                const firstDay = addDaysToDateStr(localDay(habit.createdAt, tz), -1);
                const dates = expandOccurrences(habit.recurrenceRule, habit.createdAt, startDate, endDate, tz)
                    .filter((dateKey) => dateKey >= firstDay || logsByHabitDate[`${habit.id}_${dateKey}`]);

                // Expand instances, respecting pause state
                const logsHydrated = dates
                    .filter(dateKey => !isHabitPaused(habit, dateKey, todayStr))
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
                const isDueToday = dates.includes(todayStr) && !isHabitPaused(habit, todayStr, todayStr);
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
