import { Hono } from "hono";
import { assertTaskOwnership } from "../../platform/ownership";
import { eq, and, asc, inArray } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey, createOnce } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { withCallerRls } from "../../platform/caller-rls";
import { subtasks } from "../../db/schema";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateSubtask(c: Context<{ Bindings: Env; Variables: AuthVariables }, any, any>, id: string, values: Partial<typeof subtasks.$inferInsert>) {
    const updated = await withCallerRls(c, async (tx, userId) => {
        const [row] = await tx
            .update(subtasks)
            .set(values)
            .where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)))
            .returning();
        return row;
    });

    throwIfNotFound(updated, "Subtask");
    return c.json({ data: updated });
}

export const subtaskRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/tasks/:taskId/subtasks", apiValidator("param", taskIdParamSchema), apiValidator("json", insertSubtaskSchema), async (c) => {
        const { taskId } = c.req.valid("param");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);

        const item = await withCallerRls(c, async (tx, userId) => {
            await assertTaskOwnership(tx, userId, taskId);

            return createOnce(
                tx,
                userId,
                idempotencyKey,
                (id) => tx.select().from(subtasks).where(and(eq(subtasks.id, id), eq(subtasks.userId, userId))),
                () => tx.insert(subtasks).values({ id: body.id, taskId, userId, title: body.title, orderIndex: body.orderIndex }).returning(),
            );
        });

        return c.json({ data: item }, 201);
    })
    .patch("/subtasks/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateSubtaskSchema), async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");

        return updateSubtask(c, id, body);
    })
    .patch("/subtasks/:id/reorder", apiValidator("param", uuidParamSchema), apiValidator("json", reorderSubtaskSchema), async (c) => {
        const { id } = c.req.valid("param");
        const { orderIndex } = c.req.valid("json");

        return updateSubtask(c, id, { orderIndex });
    })
    .get("/tasks/:taskId/subtasks", apiValidator("param", taskIdParamSchema), async (c) => {
        const { taskId } = c.req.valid("param");

        const items = await withCallerRls(c, async (tx, userId) => {
            await assertTaskOwnership(tx, userId, taskId);

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
        const { id } = c.req.valid("param");

        const deleted = await withCallerRls(c, async (tx, userId) => {
            const [row] = await tx
                .delete(subtasks)
                .where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)))
                .returning();
            return row;
        });

        throwIfNotFound(deleted, "Subtask");
        return c.json({ data: deleted });
    });
