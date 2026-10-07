import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { tasks, taskNotes } from "../../db/schema";
import { upsertNoteSchema } from "@cadence/contracts/note";
import { taskIdParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { writeNote } from "./notes.service";
import { AppError } from "../../platform/errors";
import { checkIdempotency, getIdempotencyKey, recordMutation, storedResult } from "../../platform/idempotency";

export const noteRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // PATCH /tasks/:taskId/note — upsert note (create or update)
    .patch(
        "/tasks/:taskId/note",
        apiValidator("param", taskIdParamSchema),
        apiValidator("json", upsertNoteSchema),
        async (c) => {
            const userId = c.get("userId");
            const { taskId } = c.req.valid("param");
            const { body, expectedVersion, expectedUpdatedAt } = c.req.valid("json");
            const db = getDbClient(c.env);
            const key = getIdempotencyKey(c);
            const fingerprint = key ? JSON.stringify([taskId, body, expectedVersion ?? null, expectedUpdatedAt ?? null]) : "";

            // A retry under the same key replays the first answer (not whatever is latest now);
            // the same key with a different edit is a client bug.
            const result = await withRls(db, userId, async (tx) => {
                if (key && (await checkIdempotency(tx, userId, key))) {
                    const first = (await storedResult(tx, userId, key)) as { fingerprint: string; row: Awaited<ReturnType<typeof writeNote>> };
                    if (first.fingerprint !== fingerprint) throw new AppError(422, "VALIDATION_ERROR", "That operation id was already used for a different edit");
                    return first.row;
                }
                const row = await writeNote(tx, userId, taskId, body, { expectedVersion, expectedUpdatedAt });
                await recordMutation(tx, userId, key, row.id, { fingerprint, row });
                return row;
            });

            return c.json({ data: result });
        },
    )
    // GET /tasks/:taskId/note — lazy load note body
    .get("/tasks/:taskId/note", apiValidator("param", taskIdParamSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId } = c.req.valid("param");
        const db = getDbClient(c.env);

        const note = await withRls(db, userId, async (tx) => {
            // Ensure parent task exists and belongs to user
            const [parent] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

            throwIfNotFound(parent, "Task");

            const [row] = await tx
                .select()
                .from(taskNotes)
                .where(and(eq(taskNotes.taskId, taskId), eq(taskNotes.userId, userId)));

            return row ?? null;
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: note });
    });
