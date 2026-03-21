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

/** Generate a plain-text excerpt from markdown (first ~120 chars). */
function generateExcerpt(body: string, maxLength = 120): string {
    // Strip markdown syntax for a clean preview
    const plain = body
        .replace(/^#{1,6}\s+/gm, "") // headings
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1") // bold/italic
        .replace(/`{1,3}[^`]*`{1,3}/g, "") // inline code / code blocks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
        .replace(/^[-*+]\s+/gm, "") // list markers
        .replace(/^\d+\.\s+/gm, "") // ordered list markers
        .replace(/\n{2,}/g, " ") // collapse paragraph breaks
        .replace(/\n/g, " ")
        .trim();
    if (plain.length <= maxLength) return plain;
    // Cut at word boundary
    const cut = plain.lastIndexOf(" ", maxLength);
    return plain.slice(0, cut > 0 ? cut : maxLength) + "…";
}

/** Count words in markdown body. */
function countWords(body: string): number {
    if (!body.trim()) return 0;
    return body.trim().split(/\s+/).length;
}

/** Count headings (lines starting with #). */
function countHeadings(body: string): number {
    return (body.match(/^#{1,6}\s+/gm) || []).length;
}

export const noteRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
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
    })
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
    );
