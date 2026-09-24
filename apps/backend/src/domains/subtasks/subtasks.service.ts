import { and, eq, inArray, max } from "drizzle-orm";
import { subtasks, tasks } from "../../db/schema";
import { AppError, throwIfNotFound } from "../../platform/errors";
import type { Tx } from "../../types/db";

/**
 * Add, change and remove a task's checklist steps in the caller's transaction.
 * Every subtask id must be on this task: one foreign id fails the batch (404)
 * before anything is written. New steps go after the current last one.
 */
export async function editSubtasks(
    tx: Tx,
    userId: string,
    {
        taskId,
        add = [],
        update = [],
        remove = [],
    }: {
        taskId: string;
        add?: string[];
        update?: { subtaskId: string; title?: string; isComplete?: boolean }[];
        remove?: { subtaskId: string }[];
    },
) {
    const [parent] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    throwIfNotFound(parent, "Task");

    const ids = [...new Set([...update, ...remove].map((item) => item.subtaskId))];
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
    return { added, updated: update.length, removed: remove.length };
}
