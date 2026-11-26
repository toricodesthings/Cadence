import { tracing } from "cloudflare:workers";
import { Hono } from "hono";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { getIdempotencyKey } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { daysBetween, todayIn } from "@cadence/domain/time";
import { habitLogs, habitTags } from "../../db/schema";
import {
    insertHabitSchema,
    updateHabitSchema,
    resolveHabitActionSchema,
    weeklyHabitsQuerySchema,
    habitListQuerySchema,
} from "@cadence/contracts/habit";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { noteAudience, noteChange, requireOwner, routineAccess, type RoutineAccess } from "../../platform/list-access";
import { apiValidator } from "../../platform/validation";
import { recordPersonActivity } from "../ai/memory/memory.service";
import {
    createHabit,
    deleteHabit,
    loadHabitsForCaller,
    projectHabitRange,
    resolveHabit,
    setRoutineMemberPrefs,
    updateHabit,
} from "./habits.service";

const noteSharedRoutine = (c: Parameters<typeof noteAudience>[0], access: RoutineAccess) => {
    if (access.audience.length > 1) {
        noteAudience(c, access);
        noteChange(c, { type: "routine" });
    }
};

export const habitRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post(
        "/:id/resolve",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", resolveHabitActionSchema),
        async (c) => {
            const userId = c.get("userId");
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");

            const { result, access } = await withCallerRls(c, async (tx) => {
                const result = await resolveHabit(tx, userId, id, body);
                const access = await routineAccess(tx, userId, id);
                return { result, access };
            });
            noteSharedRoutine(c, access);
            if (body.status === "COMPLETED") {
                c.executionCtx.waitUntil(
                    recordPersonActivity(c.env, userId, [{ kind: "routine", habitId: id, day: body.targetDate }]),
                );
            }

            return c.json({ data: result }, 200);
        },
    )
    .post("/", apiValidator("json", insertHabitSchema), async (c) => {
        const idempotencyKey = getIdempotencyKey(c);

        const habit = await withCallerRls(c, (tx, userId) =>
            createHabit(tx, userId, c.req.valid("json"), idempotencyKey),
        );

        const tags = await withCallerRls(c, async (tx) => {
            return tx.select({ tagId: habitTags.tagId }).from(habitTags).where(eq(habitTags.habitId, habit.id));
        });

        return c.json({ data: { ...habit, tagIds: tags.map((t) => t.tagId) } }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateHabitSchema), async (c) => {
        const { id } = c.req.valid("param");
        const patch = c.req.valid("json");

        const { updated, access, tagIds } = await withCallerRls(c, async (tx, userId) => {
            const access = await routineAccess(tx, userId, id);
            if (access.role === "view") {
                throw new AppError(403, "VIEW_ONLY", "You're cheering this one on; you can't edit it.");
            }
            if (access.role === "owner") {
                const updated = await updateHabit(tx, userId, id, patch);
                const tags = await tx
                    .select({ tagId: habitTags.tagId })
                    .from(habitTags)
                    .where(eq(habitTags.habitId, id));
                return { updated, access, tagIds: tags.map((t) => t.tagId) };
            }

            if (patch.archived !== undefined || patch.projectId !== undefined || patch.tagIds !== undefined) {
                requireOwner(access, "routine");
            }
            const { reminderEnabled, sortOrder, pausedUntil, ...defPatch } = patch;
            if (reminderEnabled !== undefined || sortOrder !== undefined || pausedUntil !== undefined) {
                await setRoutineMemberPrefs(tx, id, { reminderEnabled, sortOrder, pausedUntil });
            }
            if (Object.keys(defPatch).length > 0) {
                await updateHabit(tx, access.ownerId, id, defPatch, userId);
            }
            const { rows } = await loadHabitsForCaller(tx, userId, { habitId: id });
            const row = rows[0];
            throwIfNotFound(row, "Habit");
            const { participants: _p, ...rest } = row;
            return { updated: rest, access, tagIds: [] as string[] };
        });

        noteSharedRoutine(c, access);

        return c.json({ data: { ...updated, tagIds } });
    })
    .get("/", apiValidator("query", habitListQuerySchema), async (c) => {
        const { archived } = c.req.valid("query");

        const allHabits = await withCallerRls(c, async (tx, userId) => {
            const { rows } = await loadHabitsForCaller(tx, userId, { archived });
            return rows.map(({ participants: _p, ...rest }) => rest);
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: allHabits });
    })
    .get("/weekly", apiValidator("query", weeklyHabitsQuerySchema), async (c) => {
        const { start, end, archived } = c.req.valid("query");
        const callerId = c.get("userId");

        const snapshot = await withCallerRls(c, async (tx, userId) => {
            const { rows: userHabits, zone } = await loadHabitsForCaller(tx, userId, { archived: archived || false });

            if (userHabits.length === 0) return { userHabits, logs: [], allTags: [], zone, callerId };

            const habitIds = userHabits.map((h) => h.id);
            const [logs, allTags] = await Promise.all([
                tx
                    .select()
                    .from(habitLogs)
                    .where(
                        and(
                            inArray(habitLogs.habitId, habitIds),
                            gte(habitLogs.targetDate, start),
                            lte(habitLogs.targetDate, end),
                        ),
                    ),
                tx
                    .select({ habitId: habitTags.habitId, tagId: habitTags.tagId })
                    .from(habitTags)
                    .where(and(eq(habitTags.userId, userId), inArray(habitTags.habitId, habitIds))),
            ]);

            return { userHabits, logs, allTags, zone, callerId };
        });

        c.header("Cache-Control", "private, no-store");
        const result = tracing.enterSpan("habits.range.project", (span) => {
            const projected = projectHabitRange(snapshot, {
                start,
                end,
                timeZone: snapshot.zone,
                today: todayIn(snapshot.zone),
            });
            span.setAttribute("habits.count", snapshot.userHabits.length);
            const rangeDays = daysBetween(start, end) + 1;
            if (Number.isFinite(rangeDays)) span.setAttribute("habits.range_days", Math.max(0, rangeDays));
            span.setAttribute(
                "habits.expanded_days",
                projected.reduce((total, habit) => total + habit.logs.length, 0),
            );
            return projected;
        });
        return c.json({ data: result });
    })
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const habit = await withCallerRls(c, async (tx, userId) => {
            const { rows } = await loadHabitsForCaller(tx, userId, { habitId: id });
            if (!rows[0]) return undefined;
            const { participants: _p, ...rest } = rows[0];
            return rest;
        });

        throwIfNotFound(habit, "Habit");

        return c.json({ data: habit });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const { deleted, access } = await withCallerRls(c, async (tx, userId) => {
            const access = await routineAccess(tx, userId, id);
            requireOwner(access, "routine");
            const deleted = await deleteHabit(tx, userId, id);
            return { deleted, access };
        });
        noteSharedRoutine(c, access);
        return c.json({ data: deleted });
    });
