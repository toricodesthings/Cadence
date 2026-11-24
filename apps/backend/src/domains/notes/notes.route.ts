import { Hono } from "hono";
import { assertTaskOwnership } from "../../platform/ownership";
import { noteAudience, requireEdit, taskAccess } from "../../platform/list-access";
import { eq, and } from "drizzle-orm";
import { withCallerRls } from "../../platform/caller-rls";
import { taskNotes } from "../../db/schema";
import { upsertNoteSchema } from "@cadence/contracts/note";
import { taskIdParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import { writeNote } from "./notes.service";
import { resetNoteCollab } from "./note-collab";
import { AppError } from "../../platform/errors";
import { checkIdempotency, getIdempotencyKey, recordMutation, storedResult } from "../../platform/idempotency";
import { readMemoryState, scheduleLearn } from "../ai/memory/memory.service";

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
            const fingerprint = key
                ? JSON.stringify([taskId, body, expectedVersion ?? null, expectedUpdatedAt ?? null])
                : "";

            // A retry under the same key replays the first answer (not whatever is latest now);
            // the same key with a different edit is a client bug.
            let learnsNotes = false;
            let isShared = false;
            const result = await withCallerRls(c, async (tx, userId) => {
                const access = await taskAccess(tx, userId, taskId);
                requireEdit(access);
                isShared = Boolean(access && access.audience.length > 1);
                const ownerId = access?.ownerId ?? userId;
                noteAudience(c, access);
                if (key && (await checkIdempotency(tx, userId, key))) {
                    const first = (await storedResult(tx, userId, key)) as {
                        fingerprint: string;
                        row: Awaited<ReturnType<typeof writeNote>>;
                    };
                    if (first.fingerprint !== fingerprint)
                        throw new AppError(
                            422,
                            "VALIDATION_ERROR",
                            "That operation id was already used for a different edit",
                        );
                    return first.row;
                }
                const row = await writeNote(tx, ownerId, taskId, body, { expectedVersion, expectedUpdatedAt });
                await recordMutation(tx, userId, key, row.id, { fingerprint, row });
                // Someone else's words never train the owner's memory.
                learnsNotes = ownerId === userId && (await readMemoryState(tx, userId)).mode === "full";
                return row;
            });
            // Full learns from notes: the reading is queued for when this note goes quiet.
            if (learnsNotes) c.executionCtx.waitUntil(scheduleLearn(c.env, c.get("userId")));
            if (isShared) c.executionCtx.waitUntil(resetNoteCollab(c.env, taskId));

            return c.json({ data: result });
        },
    )
    // GET /tasks/:taskId/note — lazy load note body
    .get("/tasks/:taskId/note", apiValidator("param", taskIdParamSchema), async (c) => {
        const { taskId } = c.req.valid("param");

        const note = await withCallerRls(c, async (tx, callerId) => {
            const userId = (await taskAccess(tx, callerId, taskId))?.ownerId ?? callerId;
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
