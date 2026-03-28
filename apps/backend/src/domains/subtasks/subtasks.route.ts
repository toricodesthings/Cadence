import { Hono } from "hono";
import { eq, and, asc, inArray } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey, checkIdempotency, recordMutation } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { tasks, subtasks } from "../../db/schema";
import { insertSubtaskSchema, bulkSubtasksSchema, updateSubtaskSchema, reorderSubtaskSchema } from "./subtasks.schema";
import { uuidParamSchema, taskIdParamSchema } from "../../platform/common-schemas";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";

export const subtaskRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
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
    .post("/subtasks/bulk", apiValidator("json", bulkSubtasksSchema), async (c) => {
        const userId = c.get("userId");
        const { taskIds } = c.req.valid("json");
        const uniqueTaskIds = [...new Set(taskIds)];
        const db = getDbClient(c.env);

        if (uniqueTaskIds.length === 0) {
            c.header("Cache-Control", "private, no-store");
            return c.json({ data: {} });
        }

        const rows = await withRls(db, userId, async (tx) => tx
            .select()
            .from(subtasks)
            .where(and(eq(subtasks.userId, userId), inArray(subtasks.taskId, uniqueTaskIds)))
            .orderBy(asc(subtasks.taskId), asc(subtasks.orderIndex)));

        const data: Record<string, typeof rows> = Object.fromEntries(uniqueTaskIds.map((taskId) => [taskId, []]));

        for (const row of rows) {
            if (row.userId !== userId) continue;
            if (!uniqueTaskIds.includes(row.taskId)) continue;
            data[row.taskId] ??= [];
            data[row.taskId].push(row);
        }

        for (const taskId of uniqueTaskIds) {
            data[taskId].sort((a, b) => a.orderIndex - b.orderIndex);
        }

        c.header("Cache-Control", "private, no-store");
        return c.json({ data });
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
