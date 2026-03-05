import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, or, inArray, gte, lte, between, sql, asc, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { tasks, tags, taskTags } from "../db/schema";
import { insertTaskSchema, updateTaskSchema, reorderTaskSchema, batchStateSchema, taskFiltersSchema, batchRescheduleSchema } from "../types/task";
import { taskTagSchema } from "../types/tag";
import { uuidParamSchema, paginationSchema } from "../types/common";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError } from "../lib/errors";
import { trackReschedule, trackCompletion } from "../lib/metrics";

function buildTaskWhereClause(userId: string, filters: any): (SQL<unknown> | undefined)[] {
    const conditions: (SQL<unknown> | undefined)[] = [eq(tasks.userId, userId)];

    if (filters.state) {
        conditions.push(eq(tasks.state, filters.state));
    }
    if (filters.projectId) {
        conditions.push(eq(tasks.projectId, filters.projectId));
    }

    // Single day view filter over scheduledStart OR dueDate
    if (filters.scheduledDate) {
        // date format expected: YYYY-MM-DD
        const start = `${filters.scheduledDate}T00:00:00Z`;
        const end = `${filters.scheduledDate}T23:59:59Z`;
        conditions.push(
            or(
                between(tasks.scheduledStart, start, end),
                between(tasks.dueDate, start, end)
            )
        );
    }

    // Range filter over scheduledStart OR dueDate
    if (filters.scheduledRangeStart && filters.scheduledRangeEnd) {
        conditions.push(
            or(
                between(tasks.scheduledStart, filters.scheduledRangeStart, filters.scheduledRangeEnd),
                between(tasks.dueDate, filters.scheduledRangeStart, filters.scheduledRangeEnd)
            )
        );
    }

    if (filters.priority !== undefined) {
        conditions.push(eq(tasks.priority, filters.priority));
    }
    if (filters.isPinned !== undefined) {
        conditions.push(eq(tasks.isPinned, filters.isPinned));
    }

    if (filters.effort !== undefined) {
        conditions.push(eq(tasks.effort, filters.effort));
    }
    if (filters.notBeforeBefore !== undefined) {
        conditions.push(or(lte(tasks.notBefore, filters.notBeforeBefore), isNull(tasks.notBefore)));
    }
    if (filters.hasNoDate) {
        conditions.push(and(isNull(tasks.scheduledStart), isNull(tasks.dueDate)));
    }

    return conditions;
}

export const taskRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", zValidator("json", insertTaskSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const task = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .insert(tasks)
                .values({ ...body, userId })
                .returning();
            return row;
        });

        return c.json({ data: task }, 201);
    })
    .patch("/:id", zValidator("param", uuidParamSchema), zValidator("json", updateTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .update(tasks)
                .set({ ...body, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                .returning();
            return row;
        });

        if (!updated) throw new AppError(404, "NOT_FOUND", "Task not found");

        if (body.scheduledStart !== undefined) {
            c.executionCtx.waitUntil(trackReschedule(getDbClient(c.env), id, userId, body.scheduledStart));
        }
        if (body.state === "COMPLETE") {
            c.executionCtx.waitUntil(trackCompletion(getDbClient(c.env), id, userId));
        }

        return c.json({ data: updated });
    })
    .patch("/:id/reorder", zValidator("param", uuidParamSchema), zValidator("json", reorderTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { orderIndex } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .update(tasks)
                .set({ orderIndex, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                .returning();
            return row;
        });

        if (!updated) throw new AppError(404, "NOT_FOUND", "Task not found");
        return c.json({ data: updated });
    })
    .patch("/batch/state", zValidator("json", batchStateSchema), async (c) => {
        const userId = c.get("userId");
        const { taskIds, state } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updatedTasks = await withRls(db, userId, async (tx) => {
            return tx
                .update(tasks)
                .set({ state, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
                .returning();
        });

        if (state === "COMPLETE") {
            for (const id of taskIds) {
                c.executionCtx.waitUntil(trackCompletion(getDbClient(c.env), id, userId));
            }
        }

        return c.json({ data: updatedTasks });
    })
    .post("/batch/reschedule", zValidator("json", batchRescheduleSchema), async (c) => {
        const userId = c.get("userId");
        const { taskIds, scheduledStart, isAllDay } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updatedTasks = await withRls(db, userId, async (tx) => {
            return tx
                .update(tasks)
                .set({ scheduledStart, isAllDay, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
                .returning();
        });

        for (const id of taskIds) {
            c.executionCtx.waitUntil(trackReschedule(getDbClient(c.env), id, userId, scheduledStart));
        }

        return c.json({ data: updatedTasks });
    })
    .post("/:id/duplicate", zValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const duplicate = await withRls(db, userId, async (tx) => {
            const [original] = await tx
                .select()
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

            if (!original) throw new AppError(404, "NOT_FOUND", "Task not found");

            const [dup] = await tx
                .insert(tasks)
                .values({
                    userId,
                    projectId: original.projectId,
                    title: `${original.title} (copy)`,
                    content: original.content,
                    state: "ACTIVE",
                    orderIndex: original.orderIndex + 0.001,
                    isAllDay: original.isAllDay,
                    dueDate: original.dueDate,
                    scheduledStart: original.scheduledStart,
                    scheduledEnd: original.scheduledEnd,
                    durationEstimate: original.durationEstimate,
                    timezoneLocked: original.timezoneLocked,
                    priority: original.priority,
                    isPinned: false,
                    reminderAt: null,
                    reminderSilenced: false,
                    recurrenceRule: original.recurrenceRule,
                })
                .returning();

            const originalTags = await tx
                .select({ tagId: taskTags.tagId })
                .from(taskTags)
                .where(eq(taskTags.taskId, id));

            if (originalTags.length > 0) {
                await tx.insert(taskTags).values(
                    originalTags.map((t) => ({ taskId: dup.id, tagId: t.tagId }))
                );
            }

            return dup;
        });

        return c.json({ data: duplicate }, 201);
    })
    .get("/:id/tags", zValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const associations = await withRls(db, userId, async (tx) => {
            const [task] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

            if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");

            return tx
                .select({
                    id: tags.id,
                    userId: tags.userId,
                    name: tags.name,
                    color: tags.color,
                    createdAt: tags.createdAt,
                })
                .from(taskTags)
                .innerJoin(tags, eq(taskTags.tagId, tags.id))
                .where(eq(taskTags.taskId, id));
        });

        c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
        return c.json({ data: associations });
    })
    .post("/:id/tags", zValidator("param", uuidParamSchema), zValidator("json", taskTagSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { tagId } = c.req.valid("json");
        const db = getDbClient(c.env);

        const association = await withRls(db, userId, async (tx) => {
            const [task] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

            if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");

            const [tag] = await tx
                .select({ id: tags.id })
                .from(tags)
                .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));

            if (!tag) throw new AppError(404, "NOT_FOUND", "Tag not found");

            const [assoc] = await tx
                .insert(taskTags)
                .values({ taskId: id, tagId })
                .returning();
            return assoc;
        });

        return c.json({ data: association }, 201);
    })
    .delete("/:id/tags/:tagId", async (c) => {
        const userId = c.get("userId");
        const taskId = c.req.param("id");
        const tagId = c.req.param("tagId");
        const db = getDbClient(c.env);

        const deleted = await withRls(db, userId, async (tx) => {
            const [task] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

            if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");

            const [row] = await tx
                .delete(taskTags)
                .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)))
                .returning();
            return row;
        });

        if (!deleted) throw new AppError(404, "NOT_FOUND", "Tag association not found");
        return c.json({ data: { success: true } });
    })
    .get("/", zValidator("query", taskFiltersSchema.merge(paginationSchema)), async (c) => {
        const userId = c.get("userId");
        const query = c.req.valid("query");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, async (tx) => {
            const conditions = buildTaskWhereClause(userId, query);
            const returnedTasks = await tx.query.tasks.findMany({
                where: and(...conditions),
                orderBy: (tasks, { desc, asc }) => [desc(tasks.isPinned), asc(tasks.orderIndex)],
                limit: query.limit,
                offset: query.offset,
                with: {
                    tags: {
                        columns: {
                            tagId: true
                        }
                    }
                }
            });

            return returnedTasks.map(t => ({
                ...t,
                tags: undefined, // remove raw junction objects
                tagIds: t.tags.map(assoc => assoc.tagId)
            }));
        });

        c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
        return c.json({ data: items });
    })
    .get("/:id", zValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const task = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .select()
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
            return row;
        });

        if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");

        c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
        return c.json({ data: task });
    })
    .delete("/:id", zValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const deleted = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .delete(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                .returning();
            return row;
        });

        if (!deleted) throw new AppError(404, "NOT_FOUND", "Task not found");
        return c.json({ data: deleted });
    });

