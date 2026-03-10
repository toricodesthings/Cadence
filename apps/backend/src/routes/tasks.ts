import { Hono } from "hono";
import { and, between, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { tasks, tags, taskTags } from "../db/schema";
import { getDbClient } from "../lib/db";
import { AppError } from "../lib/errors";
import { trackCompletion, trackReschedule } from "../lib/metrics";
import { withRls } from "../lib/rls";
import { normalizeTaskFilters, type NormalizedTaskFilters } from "../lib/task-filters";
import {
    classifyTaskReadShape,
    hasTaskTemporalMutation,
    normalizeTaskTemporalFields,
} from "../lib/task-normalization";
import { apiValidator } from "../lib/validation";
import type { AuthVariables } from "../lib/auth";
import { uuidParamSchema } from "../types/common";
import { taskTagSchema } from "../types/tag";
import {
    batchRescheduleSchema,
    batchStateSchema,
    insertTaskSchema,
    reorderTaskSchema,
    taskFiltersSchema,
    taskListQuerySchema,
    updateTaskSchema,
} from "../types/task";
import type { Env } from "../types/env";

const taskTagParamSchema = z.object({
    id: z.string().uuid(),
    tagId: z.string().uuid(),
});

function buildEffectiveTaskAnchorExpression() {
    return sql<string>`case
        when ${tasks.isAllDay} = true then coalesce(${tasks.dueDate}, ${tasks.scheduledStart})
        else coalesce(${tasks.scheduledStart}, ${tasks.dueDate})
    end`;
}

export function buildTaskWhereClause(userId: string, filters: NormalizedTaskFilters): (SQL<unknown> | undefined)[] {
    const conditions: (SQL<unknown> | undefined)[] = [eq(tasks.userId, userId)];

    if (filters.state) {
        conditions.push(eq(tasks.state, filters.state));
    }
    if (filters.projectId) {
        conditions.push(eq(tasks.projectId, filters.projectId));
    }

    if (filters.scheduledDate) {
        const start = `${filters.scheduledDate}T00:00:00.000Z`;
        const end = `${filters.scheduledDate}T23:59:59.999Z`;
        conditions.push(or(between(tasks.scheduledStart, start, end), between(tasks.dueDate, start, end)));
    }

    if (filters.scheduledRangeStart && filters.scheduledRangeEnd) {
        conditions.push(
            or(
                between(tasks.scheduledStart, filters.scheduledRangeStart, filters.scheduledRangeEnd),
                between(tasks.dueDate, filters.scheduledRangeStart, filters.scheduledRangeEnd),
            ),
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
    if (filters.hasNoProject) {
        conditions.push(isNull(tasks.projectId));
    }
    if (filters.effectiveOnOrBeforeDateTime) {
        conditions.push(lte(buildEffectiveTaskAnchorExpression(), filters.effectiveOnOrBeforeDateTime));
    }

    return conditions;
}

function getTemporalFieldsForPersistence(fields: {
    dueDate?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    isAllDay?: boolean | null;
}) {
    return normalizeTaskTemporalFields(fields);
}

export const taskRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", insertTaskSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);
        const temporalFields = getTemporalFieldsForPersistence(body);

        const task = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .insert(tasks)
                .values({
                    ...body,
                    ...temporalFields,
                    userId,
                })
                .returning();
            return row;
        });

        return c.json({ data: task }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            const [existing] = await tx
                .select({
                    id: tasks.id,
                    isAllDay: tasks.isAllDay,
                    dueDate: tasks.dueDate,
                    scheduledStart: tasks.scheduledStart,
                    scheduledEnd: tasks.scheduledEnd,
                })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

            if (!existing) throw new AppError(404, "NOT_FOUND", "Task not found");

            const temporalPatch = hasTaskTemporalMutation(body)
                ? getTemporalFieldsForPersistence({
                    isAllDay: body.isAllDay ?? existing.isAllDay,
                    dueDate: body.dueDate ?? existing.dueDate,
                    scheduledStart: body.scheduledStart ?? existing.scheduledStart,
                    scheduledEnd: body.scheduledEnd ?? existing.scheduledEnd,
                })
                : {};

            const [row] = await tx
                .update(tasks)
                .set({ ...body, ...temporalPatch, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                .returning();
            return row;
        });

        if (hasTaskTemporalMutation(body)) {
            c.executionCtx.waitUntil(
                trackReschedule(getDbClient(c.env), id, userId, updated.scheduledStart ?? updated.dueDate),
            );
        }
        if (body.state === "COMPLETE") {
            c.executionCtx.waitUntil(trackCompletion(getDbClient(c.env), id, userId));
        }

        return c.json({ data: updated });
    })
    .patch("/:id/reorder", apiValidator("param", uuidParamSchema), apiValidator("json", reorderTaskSchema), async (c) => {
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
    .patch("/batch/state", apiValidator("json", batchStateSchema), async (c) => {
        const userId = c.get("userId");
        const { taskIds, state } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updatedTasks = await withRls(db, userId, async (tx) =>
            tx
                .update(tasks)
                .set({ state, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
                .returning(),
        );

        if (state === "COMPLETE") {
            for (const id of taskIds) {
                c.executionCtx.waitUntil(trackCompletion(getDbClient(c.env), id, userId));
            }
        }

        return c.json({ data: updatedTasks });
    })
    .post("/batch/reschedule", apiValidator("json", batchRescheduleSchema), async (c) => {
        const userId = c.get("userId");
        const { taskIds, scheduledStart, isAllDay } = c.req.valid("json");
        const db = getDbClient(c.env);
        const temporalFields = getTemporalFieldsForPersistence({
            isAllDay,
            scheduledStart,
        });

        const updatedTasks = await withRls(db, userId, async (tx) =>
            tx
                .update(tasks)
                .set({ ...temporalFields, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
                .returning(),
        );

        for (const id of taskIds) {
            c.executionCtx.waitUntil(
                trackReschedule(getDbClient(c.env), id, userId, temporalFields.scheduledStart ?? temporalFields.dueDate),
            );
        }

        return c.json({ data: updatedTasks });
    })
    .post("/:id/duplicate", apiValidator("param", uuidParamSchema), async (c) => {
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
                await tx.insert(taskTags).values(originalTags.map((tag) => ({ taskId: dup.id, tagId: tag.tagId })));
            }

            return dup;
        });

        return c.json({ data: duplicate }, 201);
    })
    .get("/:id/tags", apiValidator("param", uuidParamSchema), async (c) => {
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

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: associations });
    })
    .post("/:id/tags", apiValidator("param", uuidParamSchema), apiValidator("json", taskTagSchema), async (c) => {
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
    .delete("/:id/tags/:tagId", apiValidator("param", taskTagParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id: taskId, tagId } = c.req.valid("param");
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
    .get("/", apiValidator("query", taskListQuerySchema), async (c) => {
        const userId = c.get("userId");
        const query = normalizeTaskFilters(c.req.valid("query"));
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, async (tx) => {
            const conditions = buildTaskWhereClause(userId, query);
            const returnedTasks = await tx.query.tasks.findMany({
                where: and(...conditions),
                orderBy: (taskTable, { asc, desc }) => [desc(taskTable.isPinned), asc(taskTable.orderIndex)],
                limit: query.limit,
                offset: query.offset,
                with: {
                    tags: {
                        columns: {
                            tagId: true,
                        },
                    },
                },
            });

            return returnedTasks.map((task) => ({
                ...task,
                tags: undefined,
                tagIds: task.tags.map((assoc) => assoc.tagId),
            }));
        });

        c.header("Cache-Control", "private, no-store");
        c.header(
            "X-Task-Read-Compatibility",
            [
                "timed_block=!isAllDay&&scheduledStart",
                "all_day_duration=isAllDay&&dueDate&&scheduledEnd",
                "deadline_only=isAllDay&&dueDate&&!scheduledEnd",
                "legacy_all_day_with_start=isAllDay&&scheduledStart",
                "legacy_mixed_timed_deadline=!isAllDay&&scheduledStart&&dueDate",
            ].join("; "),
        );
        return c.json({ data: items });
    })
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
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

        c.header("Cache-Control", "private, no-store");
        c.header("X-Task-Read-Shape", classifyTaskReadShape(task));
        return c.json({ data: task });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
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
