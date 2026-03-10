import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { taskSections } from "../db/schema";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError } from "../lib/errors";
import { apiValidator } from "../lib/validation";

const uuidParamSchema = z.object({ id: z.string().uuid() });

const createSectionSchema = z.object({
    name: z.string().min(1).max(200),
    orderIndex: z.number(),
});

const updateSectionSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    orderIndex: z.number().optional(),
});

export const sectionRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // GET /api/sections — list all user sections
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const rows = await withRls(db, userId, async (tx) =>
            tx
                .select()
                .from(taskSections)
                .where(eq(taskSections.userId, userId))
                .orderBy(asc(taskSections.orderIndex))
        );

        return c.json({ data: rows });
    })
    // POST /api/sections — create a section
    .post("/", apiValidator("json", createSectionSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const section = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .insert(taskSections)
                .values({ ...body, userId })
                .returning();
            return row;
        });

        return c.json({ data: section }, 201);
    })
    // PATCH /api/sections/:id — update a section
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateSectionSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .update(taskSections)
                .set(body)
                .where(and(eq(taskSections.id, id), eq(taskSections.userId, userId)))
                .returning();
            return row;
        });

        if (!updated) throw new AppError(404, "NOT_FOUND", "Section not found");
        return c.json({ data: updated });
    })
    // DELETE /api/sections/:id — delete a section (tasks become ungrouped via ON DELETE SET NULL)
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        await withRls(db, userId, async (tx) => {
            const result = await tx
                .delete(taskSections)
                .where(and(eq(taskSections.id, id), eq(taskSections.userId, userId)))
                .returning();
            if (result.length === 0) throw new AppError(404, "NOT_FOUND", "Section not found");
        });

        return c.json({ success: true });
    });
