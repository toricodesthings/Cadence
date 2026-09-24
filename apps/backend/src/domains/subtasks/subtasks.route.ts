import { Hono } from "hono";
import { eq, and, asc, inArray } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey, checkIdempotency, recordMutation } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { tasks, subtasks } from "../../db/schema";
import { insertSubtaskSchema, bulkSubtasksSchema, subtasksByTaskQuerySchema, updateSubtaskSchema, reorderSubtaskSchema } from "@cadence/contracts/subtask";
import { uuidParamSchema, taskIdParamSchema } from "@cadence/contracts/common";
import type { Context } from "hono";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";

type SubtaskContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/** Subtasks for many tasks at once, keyed by task id (unknown ids map to []). */
async function subtasksByTask(c: SubtaskContext, taskIds: string[]) {
    const userId = c.get("userId");
    const uniqueTaskIds = [...new Set(taskIds)];
    c.header("Cache-Control", "private, no-store");
    if (uniqueTaskIds.length === 0) return c.json({ data: {} as Record<string, (typeof subtasks.$inferSelect)[]> });

    const rows = await withRls(getDbClient(c.env), userId, (tx) => tx
        .select()
        .from(subtasks)
        .where(and(eq(subtasks.userId, userId), inArray(subtasks.taskId, uniqueTaskIds)))
        .orderBy(asc(subtasks.taskId), asc(subtasks.orderIndex)));

    const data: Record<string, typeof rows> = Object.fromEntries(uniqueTaskIds.map((taskId) => [taskId, []]));
    for (const row of rows) data[row.taskId]?.push(row);
    return c.json({ data });
}

export const subtaskRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/tasks/:taskId/subtasks", apiValidator("param", taskIdParamSchema), apiValidator("json", insertSubtaskSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId } = c.req.valid("param");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const item = await withRls(db, userId, async (tx) => {
            const [parent] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

            throwIfNotFound(parent, "Task");

            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(subtasks).where(and(eq(subtasks.id, existingId), eq(subtasks.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(subtasks)
                .values({
                    taskId,
                    userId,
                    title: body.title,
                    orderIndex: body.orderIndex,
                })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: item }, 201);
    })
    .patch("/subtasks/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateSubtaskSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .update(subtasks)
                .set(body)
                .where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)))
                .returning();
            return row;
        });

        throwIfNotFound(updated, "Subtask");
        return c.json({ data: updated });
    })
    .patch("/subtasks/:id/reorder", apiValidator("param", uuidParamSchema), apiValidator("json", reorderSubtaskSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { orderIndex } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .update(subtasks)
                .set({ orderIndex })
                .where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)))
                .returning();
            return row;
        });

        throwIfNotFound(updated, "Subtask");
        return c.json({ data: updated });
    })
    .get("/tasks/:taskId/subtasks", apiValidator("param", taskIdParamSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId } = c.req.valid("param");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, async (tx) => {
            // Ensure parent task exists and belongs to user
            const [parent] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

            throwIfNotFound(parent, "Task");

            return tx
                .select()
                .from(subtasks)
                .where(and(eq(subtasks.taskId, taskId), eq(subtasks.userId, userId)))
                .orderBy(asc(subtasks.orderIndex));
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: items });
    })
    .get("/subtasks", apiValidator("query", subtasksByTaskQuerySchema), (c) => subtasksByTask(c, c.req.valid("query").taskIds))
    // Desktop builds bundle the frontend, so ones released before the GET still call this.
    .post("/subtasks/bulk", apiValidator("json", bulkSubtasksSchema), (c) => subtasksByTask(c, c.req.valid("json").taskIds))
    .delete("/subtasks/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const deleted = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .delete(subtasks)
                .where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)))
                .returning();
            return row;
        });

        throwIfNotFound(deleted, "Subtask");
        return c.json({ data: deleted });
    });
