import { Hono } from "hono";
import { eq, and, or, inArray, gte, lte, between, sql, desc, asc } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { habits, habitLogs } from "../db/schema";
import { insertHabitSchema, updateHabitSchema, resolveHabitActionSchema, weeklyHabitsQuerySchema, monthlyHabitsQuerySchema, habitListQuerySchema } from "../types/habit";
import { uuidParamSchema } from "../types/common";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError } from "../lib/errors";
import { rrulestr } from "rrule";
import { parseISO } from "date-fns";
import { apiValidator } from "../lib/validation";

export const habitsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", insertHabitSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const habit = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .insert(habits)
                .values({ ...body, userId })
                .returning();
            return row;
        });

        return c.json({ data: habit }, 201);
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
    .get("/unresolved", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);
        // Note: For intelligent toast, this could query the logs for yesterday/today based on UTC boundary,
        // and find habits which do not have a log yet. For now, we return empty structure.
        return c.json({ data: [] });
    })
    .get("/weekly", apiValidator("query", weeklyHabitsQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { start, end, archived } = c.req.valid("query");
        const db = getDbClient(c.env);

        // start/end arrive as "YYYY-MM-DD" from the frontend.
        // Build UTC boundaries: start at 00:00:00 UTC, end at 23:59:59.999 UTC.
        const startDate = new Date(`${start}T00:00:00.000Z`);
        const endDate = new Date(`${end}T23:59:59.999Z`);

        const result = await withRls(db, userId, async (tx) => {
            const userHabits = await tx
                .select()
                .from(habits)
                .where(and(
                    eq(habits.userId, userId),
                    eq(habits.archived, archived || false) // Map to archived payload
                ));

            if (userHabits.length === 0) return [];

            const habitIds = userHabits.map((h) => h.id);

            // Using ISO strings for comparing since `targetDate` is stored as string in timestamp with timezone mode (handled by PG driver natively)
            const logs = await tx
                .select()
                .from(habitLogs)
                .where(
                    and(
                        eq(habitLogs.userId, userId),
                        inArray(habitLogs.habitId, habitIds),
                        gte(habitLogs.targetDate, startDate.toISOString()),
                        lte(habitLogs.targetDate, endDate.toISOString()),
                    )
                );

            const logsByHabitDate: Record<string, typeof logs[0]> = {};
            for (const log of logs) {
                // Truncate to just date for quick lookup map
                const dateKey = log.targetDate.substring(0, 10);
                logsByHabitDate[`${log.habitId}_${dateKey}`] = log;
            }

            return userHabits.map((habit) => {
                let rule: Exclude<ReturnType<typeof rrulestr>, null> | undefined;
                let instances: Date[] = [];
                try {
                    rule = rrulestr(habit.recurrenceRule);
                    instances = rule.between(startDate, endDate, true);
                } catch (e) {
                    console.error("Invalid recurrence rule", habit.recurrenceRule, e);
                }

                // Expand instances
                const logsHydrated = instances.map((targetD) => {
                    // Assuming UTC formatting or simple substring to match YYYY-MM-DD
                    const iso = targetD.toISOString();
                    const dateKey = iso.substring(0, 10);
                    const logKey = `${habit.id}_${dateKey}`;
                    const existingLog = logsByHabitDate[logKey];

                    return {
                        id: existingLog?.id || `virt_${dateKey}`,
                        habitId: habit.id,
                        status: existingLog?.status || "PENDING",
                        targetDate: iso, // Use full time output from recurrence
                        completedAt: existingLog?.completedAt || null,
                    };
                });

                return {
                    ...habit,
                    logs: logsHydrated,
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

        if (!habit) throw new AppError(404, "NOT_FOUND", "Habit not found");

        return c.json({ data: habit });
    })
    /** Return all habit logs for a given calendar month (for the heatmap calendar). */
    .get("/:id/monthly", apiValidator("param", uuidParamSchema), apiValidator("query", monthlyHabitsQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { year, month } = c.req.valid("query");
        const db = getDbClient(c.env);

        // Build inclusive UTC date range for the month.
        // Using explicit UTC construction avoids Cloudflare Workers UTC-only runtime
        // creating different boundaries than the frontend intended.
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month, daysInMonth, 23, 59, 59, 999));

        const result = await withRls(db, userId, async (tx) => {
            const [habit] = await tx
                .select()
                .from(habits)
                .where(and(eq(habits.id, id), eq(habits.userId, userId)));

            if (!habit) throw new AppError(404, "NOT_FOUND", "Habit not found");

            const logs = await tx
                .select()
                .from(habitLogs)
                .where(
                    and(
                        eq(habitLogs.habitId, id),
                        eq(habitLogs.userId, userId),
                        gte(habitLogs.targetDate, startDate.toISOString()),
                        lte(habitLogs.targetDate, endDate.toISOString())
                    )
                );

            // Also compute which days in this month the habit is scheduled (via rrule)
            let scheduledDays: number[] = [];
            try {
                const rule = rrulestr(habit.recurrenceRule);
                const instances = rule.between(startDate, endDate, true);
                scheduledDays = instances.map((d) => parseInt(d.toISOString().substring(8, 10), 10));
            } catch (e) {
                console.error("Invalid recurrence rule for monthly view", e);
            }

            // Build a map of day -> status
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
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .update(habits)
                .set({ ...body, updatedAt: sql`NOW()` })
                .where(and(eq(habits.id, id), eq(habits.userId, userId)))
                .returning();
            return row;
        });

        if (!updated) throw new AppError(404, "NOT_FOUND", "Habit not found");
        return c.json({ data: updated });
    })
    .post("/:id/resolve", apiValidator("param", uuidParamSchema), apiValidator("json", resolveHabitActionSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { targetDate, status } = c.req.valid("json");
        const db = getDbClient(c.env);

        const result = await withRls(db, userId, async (tx) => {
            // Find habit
            const [habit] = await tx
                .select()
                .from(habits)
                .where(and(eq(habits.id, id), eq(habits.userId, userId)));

            if (!habit) throw new AppError(404, "NOT_FOUND", "Habit not found");

            // Look up existing log
            // We want to match exactly by targetDate (YYYY-MM-DD), so let's match substring
            const datePrefix = targetDate.substring(0, 10);
            const [existing] = await tx
                .select()
                .from(habitLogs)
                .where(
                    and(
                        eq(habitLogs.userId, userId),
                        eq(habitLogs.habitId, habit.id),
                        sql`substring(${habitLogs.targetDate}::text from 1 for 10) = ${datePrefix}`
                    )
                );

            let row;
            let wasCompleted = existing?.status === "COMPLETED";

            if (existing) {
                [row] = await tx
                    .update(habitLogs)
                    .set({
                        status,
                        completedAt: status === "COMPLETED" ? sql`NOW()` : null,
                    })
                    .where(eq(habitLogs.id, existing.id))
                    .returning();
            } else {
                [row] = await tx
                    .insert(habitLogs)
                    .values({
                        userId,
                        habitId: habit.id,
                        targetDate: targetDate, // full iso
                        status,
                        completedAt: status === "COMPLETED" ? sql`NOW()` : null,
                    })
                    .returning();
            }

            let newTotalCompletions = habit.totalCompletions;
            let newTotalSkips = habit.totalSkips;
            let newCurrentStreak = habit.currentStreak;
            // Streak math: if marking as completed from pending/skipped, +1.
            // if marking as skipped/pending from completed, -1
            if (status === "COMPLETED" && !wasCompleted) {
                newTotalCompletions++;
                newCurrentStreak++;
            } else if (status !== "COMPLETED" && wasCompleted) {
                newTotalCompletions--;
                newCurrentStreak = Math.max(0, newCurrentStreak - 1);
            }

            if (status === "SKIPPED" && existing?.status !== "SKIPPED") {
                newTotalSkips++;
            }

            const newLongestStreak = Math.max(habit.longestStreak, newCurrentStreak);

            // Update habit stats
            const [updatedHabit] = await tx
                .update(habits)
                .set({
                    totalCompletions: newTotalCompletions,
                    totalSkips: newTotalSkips,
                    currentStreak: newCurrentStreak,
                    longestStreak: newLongestStreak,
                    updatedAt: sql`NOW()`,
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

        if (!deleted) throw new AppError(404, "NOT_FOUND", "Habit not found");
        return c.json({ data: deleted });
    });
