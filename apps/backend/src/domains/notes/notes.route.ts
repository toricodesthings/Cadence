import { Hono } from "hono";
import { assertTaskOwnership } from "../../platform/ownership";
import { eq, and } from "drizzle-orm";
import { withCallerRls } from "../../platform/caller-rls";
import { taskNotes } from "../../db/schema";
import { upsertNoteSchema } from "@cadence/contracts/note";
import { taskIdParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
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
            const { taskId } = c.req.valid("param");
            const { body, expectedVersion, expectedUpdatedAt } = c.req.valid("json");
                const key = getIdempotencyKey(c);
            const fingerprint = key ? JSON.stringify([taskId, body, expectedVersion ?? null, expectedUpdatedAt ?? null]) : "";

            // A retry under the same key replays the first answer (not whatever is latest now);
            // the same key with a different edit is a client bug.
            const result = await withCallerRls(c, async (tx, userId) => {
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
        const { taskId } = c.req.valid("param");

        const note = await withCallerRls(c, async (tx, userId) => {
            await assertTaskOwnership(tx, userId, taskId);

            const [row] = await tx
                .select()
                .from(taskNotes)
                .where(and(eq(taskNotes.taskId, taskId), eq(taskNotes.userId, userId)));

            return row ?? null;
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: note });
    });
