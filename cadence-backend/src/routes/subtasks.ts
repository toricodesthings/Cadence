import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, asc } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { tasks, subtasks } from "../db/schema";
import { insertSubtaskSchema, updateSubtaskSchema, reorderSubtaskSchema } from "../types/subtask";
import { uuidParamSchema } from "../types/common";
import { z } from "zod";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError } from "../lib/errors";

const taskIdParamSchema = z.object({
    taskId: z.string().uuid(),
});

export const subtasksRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .get("/tasks/:taskId/subtasks", zValidator("param", taskIdParamSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId } = c.req.valid("param");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, async (tx) => {
            // Ensure parent task exists and belongs to user
            const [parent] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

            if (!parent) throw new AppError(404, "NOT_FOUND", "Task not found");

            return tx
                .select()
                .from(subtasks)
                .where(and(eq(subtasks.taskId, taskId), eq(subtasks.userId, userId)))
                .orderBy(asc(subtasks.orderIndex));
        });

        c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
        return c.json({ data: items });
    })
    .post("/tasks/:taskId/subtasks", zValidator("param", taskIdParamSchema), zValidator("json", insertSubtaskSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const item = await withRls(db, userId, async (tx) => {
            const [parent] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

            if (!parent) throw new AppError(404, "NOT_FOUND", "Task not found");

            const [row] = await tx
                .insert(subtasks)
                .values({
                    taskId,
                    userId,
                    title: body.title,
                    orderIndex: body.orderIndex,
                })
                .returning();
            return row;
        });

        return c.json({ data: item }, 201);
    })
    .patch("/subtasks/:id", zValidator("param", uuidParamSchema), zValidator("json", updateSubtaskSchema), async (c) => {
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

        if (!updated) throw new AppError(404, "NOT_FOUND", "Subtask not found");
        return c.json({ data: updated });
    })
    .patch("/subtasks/:id/reorder", zValidator("param", uuidParamSchema), zValidator("json", reorderSubtaskSchema), async (c) => {
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

        if (!updated) throw new AppError(404, "NOT_FOUND", "Subtask not found");
        return c.json({ data: updated });
    })
    .delete("/subtasks/:id", zValidator("param", uuidParamSchema), async (c) => {
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

        if (!deleted) throw new AppError(404, "NOT_FOUND", "Subtask not found");
        return c.json({ data: deleted });
    });
