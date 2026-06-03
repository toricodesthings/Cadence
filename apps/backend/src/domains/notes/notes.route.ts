import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { tasks, taskNotes } from "../../db/schema";
import { upsertNoteSchema } from "./notes.schema";
import { taskIdParamSchema } from "../../platform/common-schemas";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound, assertNoConflict } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { generateExcerpt, countWords, countHeadings } from "./note-analysis";

export const noteRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // PATCH /tasks/:taskId/note — upsert note (create or update)
    .patch(
        "/tasks/:taskId/note",
        apiValidator("param", taskIdParamSchema),
        apiValidator("json", upsertNoteSchema),
        async (c) => {
            const userId = c.get("userId");
            const { taskId } = c.req.valid("param");
            const { body, expectedUpdatedAt } = c.req.valid("json");
            const db = getDbClient(c.env);

            const excerpt = generateExcerpt(body);
            const wordCount = countWords(body);
            const headingCount = countHeadings(body);

            const result = await withRls(db, userId, async (tx) => {
                // Ensure parent task exists
                const [parent] = await tx
                    .select({ id: tasks.id })
                    .from(tasks)
                    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

                throwIfNotFound(parent, "Task");

                // Check for existing note
                const [existing] = await tx
                    .select({ id: taskNotes.id, updatedAt: taskNotes.updatedAt, version: taskNotes.version })
                    .from(taskNotes)
                    .where(and(eq(taskNotes.taskId, taskId), eq(taskNotes.userId, userId)));

                if (existing) {
                    // Update existing note with conflict detection
                    assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Note");

                    const [row] = await tx
                        .update(taskNotes)
                        .set({
                            body,
                            excerpt,
                            wordCount,
                            headingCount,
                            version: existing.version + 1,
                            updatedAt: sql`NOW()`,
                        })
                        .where(and(eq(taskNotes.id, existing.id), eq(taskNotes.userId, userId)))
                        .returning();
                    return row;
                }

                // Insert new note
                const [row] = await tx
                    .insert(taskNotes)
                    .values({
                        taskId,
                        userId,
                        body,
                        excerpt,
                        wordCount,
                        headingCount,
                    })
                    .returning();
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
