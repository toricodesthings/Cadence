import { and, eq, inArray, max } from "drizzle-orm";
import { subtasks, tasks } from "../../db/schema";
import { AppError, throwIfNotFound } from "../../platform/errors";
import type { Tx } from "../../types/db";

/**
 * Add, change and remove a task's checklist steps in the caller's transaction.
 * Every subtask id must be on this task: one foreign id fails the batch (404)
 * before anything is written. `order` lists existing steps in their new order
 * (steps it leaves out follow, as they were); new steps go after the last one.
 */
export async function editSubtasks(
    tx: Tx,
    userId: string,
    {
        taskId,
        add = [],
        update = [],
        remove = [],
        order = [],
    }: {
        taskId: string;
        add?: string[];
        update?: { subtaskId: string; title?: string; isComplete?: boolean }[];
        remove?: { subtaskId: string }[];
        order?: string[];
    },
) {
    const [parent] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    throwIfNotFound(parent, "Task");

    const ids = [...new Set([...update.map((item) => item.subtaskId), ...remove.map((item) => item.subtaskId), ...order])];
    if (ids.length) {
        const found = await tx
            .select({ id: subtasks.id })
            .from(subtasks)
            .where(and(eq(subtasks.taskId, taskId), eq(subtasks.userId, userId), inArray(subtasks.id, ids)));
        if (found.length !== ids.length) throw new AppError(404, "NOT_FOUND", "Subtask not found on this task");
    }

    // Pipelined on the transaction's connection, not one round trip per subtask.
    await Promise.all(
        update
            .filter(({ title, isComplete }) => title !== undefined || isComplete !== undefined)
            .map(({ subtaskId, ...change }) =>
                tx.update(subtasks).set(change).where(and(eq(subtasks.id, subtaskId), eq(subtasks.userId, userId)))),
    );
    if (remove.length) {
        await tx.delete(subtasks).where(and(eq(subtasks.userId, userId), inArray(subtasks.id, remove.map((item) => item.subtaskId))));
    }
    if (order.length) {
        const current = await tx
            .select({ id: subtasks.id })
            .from(subtasks)
            .where(and(eq(subtasks.taskId, taskId), eq(subtasks.userId, userId)))
            .orderBy(subtasks.orderIndex);
        const listed = new Set(order);
        const next = [...order, ...current.map((row) => row.id).filter((id) => !listed.has(id))];
        await Promise.all(next.map((id, orderIndex) =>
            tx.update(subtasks).set({ orderIndex }).where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)))));
    }
    let added: string[] = [];
    if (add.length) {
        const [{ last }] = await tx
            .select({ last: max(subtasks.orderIndex) })
            .from(subtasks)
            .where(and(eq(subtasks.taskId, taskId), eq(subtasks.userId, userId)));
        const start = (last ?? -1) + 1;
        const rows = await tx
            .insert(subtasks)
            .values(add.map((title, i) => ({ taskId, userId, title, orderIndex: start + i })))
            .returning({ id: subtasks.id });
        added = rows.map((row) => row.id);
    }
    return { added, updated: update.length, removed: remove.length, ...(order.length && { reordered: order.length }) };
}
