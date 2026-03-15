import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { taskSections } from "../db/schema";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError, throwIfNotFound } from "../lib/errors";
import { apiValidator } from "../lib/validation";
import { uuidParamSchema } from "../types/common";
import { createSectionSchema, updateSectionSchema } from "../types/section";

export const sectionRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // GET /api/sections?projectId=... — list sections for a project (or unscoped if no projectId)
    .get("/", async (c) => {
        const userId = c.get("userId");
        const projectId = c.req.query("projectId") ?? null;
        const db = getDbClient(c.env);

        const conditions = [eq(taskSections.userId, userId)];
        if (projectId) {
            conditions.push(eq(taskSections.projectId, projectId));
        } else {
            conditions.push(sql`${taskSections.projectId} IS NULL`);
        }

        const rows = await withRls(db, userId, async (tx) =>
            tx
                .select()
                .from(taskSections)
                .where(and(...conditions))
                .orderBy(asc(taskSections.orderIndex))
        );

        return c.json({ data: rows });
    })
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

        throwIfNotFound(updated, "Section");
        return c.json({ data: updated });
    })
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
