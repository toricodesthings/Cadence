import { Hono } from "hono";
import { assertTaskOwnership } from "../../platform/ownership";
import { noteAudience, requireEdit, taskAccess, type ListAccess } from "../../platform/list-access";
import type { Tx } from "../../types/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey, createOnce } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { withCallerRls } from "../../platform/caller-rls";
import { subtasks } from "../../db/schema";
import {
    insertSubtaskSchema,
    bulkSubtasksSchema,
    subtasksByTaskQuerySchema,
    updateSubtaskSchema,
    reorderSubtaskSchema,
} from "@cadence/contracts/subtask";
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

    const rows = await withRls(getDbClient(c.env), userId, (tx) =>
        tx
            .select()
            .from(subtasks)
            // RLS limits this to the caller's own tasks and those of lists shared with them.
            .where(inArray(subtasks.taskId, uniqueTaskIds))
            .orderBy(asc(subtasks.taskId), asc(subtasks.orderIndex)),
    );

    const data: Record<string, typeof rows> = Object.fromEntries(uniqueTaskIds.map((taskId) => [taskId, []]));
    for (const row of rows) data[row.taskId]?.push(row);
    return c.json({ data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateSubtask(
    c: Context<{ Bindings: Env; Variables: AuthVariables }, any, any>,
    id: string,
    values: Partial<typeof subtasks.$inferInsert>,
) {
    const updated = await withCallerRls(c, async (tx, userId) => {
        const { access, ownerId } = await subtaskAccess(tx, userId, id);
        const [row] = await tx
            .update(subtasks)
            .set(values)
            .where(and(eq(subtasks.id, id), eq(subtasks.userId, ownerId)))
            .returning();
        noteAudience(c, access);
        return row;
    });

    throwIfNotFound(updated, "Subtask");
    return c.json({ data: updated });
}

/** The access a subtask is governed by (its task's list), and whose row it is. 404 when it isn't visible. */
async function subtaskAccess(
    tx: Tx,
    userId: string,
    id: string,
): Promise<{ access: ListAccess | null; ownerId: string }> {
    const [found] = await tx
        .select({ taskId: subtasks.taskId, userId: subtasks.userId })
        .from(subtasks)
        .where(eq(subtasks.id, id));
    throwIfNotFound(found, "Subtask");
    const access = await taskAccess(tx, userId, found.taskId);
    requireEdit(access);
    return { access, ownerId: found.userId };
}

export const subtaskRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post(
        "/tasks/:taskId/subtasks",
        apiValidator("param", taskIdParamSchema),
        apiValidator("json", insertSubtaskSchema),
        async (c) => {
            const { taskId } = c.req.valid("param");
            const body = c.req.valid("json");
            const idempotencyKey = getIdempotencyKey(c);

            const item = await withCallerRls(c, async (tx, callerId) => {
                const access = await taskAccess(tx, callerId, taskId);
                requireEdit(access);
                const userId = access?.ownerId ?? callerId;
                await assertTaskOwnership(tx, userId, taskId);
                noteAudience(c, access);

                return createOnce(
                    tx,
                    callerId,
                    idempotencyKey,
                    (id) =>
                        tx
                            .select()
                            .from(subtasks)
                            .where(and(eq(subtasks.id, id), eq(subtasks.userId, userId))),
                    () =>
                        tx
                            .insert(subtasks)
                            .values({ id: body.id, taskId, userId, title: body.title, orderIndex: body.orderIndex })
                            .returning(),
                );
            });

            return c.json({ data: item }, 201);
        },
    )
    .patch(
        "/subtasks/:id",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", updateSubtaskSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");

            return updateSubtask(c, id, body);
        },
    )
    .patch(
        "/subtasks/:id/reorder",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", reorderSubtaskSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const { orderIndex } = c.req.valid("json");

            return updateSubtask(c, id, { orderIndex });
        },
    )
    .get("/tasks/:taskId/subtasks", apiValidator("param", taskIdParamSchema), async (c) => {
        const { taskId } = c.req.valid("param");

        const items = await withCallerRls(c, async (tx, callerId) => {
            const userId = (await taskAccess(tx, callerId, taskId))?.ownerId ?? callerId;
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
    .get("/subtasks", apiValidator("query", subtasksByTaskQuerySchema), (c) =>
        subtasksByTask(c, c.req.valid("query").taskIds),
    )
    // Desktop builds bundle the frontend, so ones released before the GET still call this.
    .post("/subtasks/bulk", apiValidator("json", bulkSubtasksSchema), (c) =>
        subtasksByTask(c, c.req.valid("json").taskIds),
    )
    .delete("/subtasks/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const deleted = await withCallerRls(c, async (tx, userId) => {
            const { access, ownerId } = await subtaskAccess(tx, userId, id);
            const [row] = await tx
                .delete(subtasks)
                .where(and(eq(subtasks.id, id), eq(subtasks.userId, ownerId)))
                .returning();
            noteAudience(c, access);
            return row;
        });

        throwIfNotFound(deleted, "Subtask");
        return c.json({ data: deleted });
    });
