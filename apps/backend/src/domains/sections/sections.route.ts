import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey, checkIdempotency, recordMutation } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { taskSections } from "../../db/schema";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { assertProjectOwnership } from "../../platform/ownership";
import { apiValidator } from "../../platform/validation";
import { uuidParamSchema } from "../../platform/common-schemas";
import { createSectionSchema, updateSectionSchema, sectionQuerySchema } from "./sections.schema";

export const sectionRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // GET /api/sections?projectId=... — list sections for a project (or unscoped if no projectId)
    .get("/", apiValidator("query", sectionQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { projectId } = c.req.valid("query");
        const projectIdValue = projectId ?? null;
        const db = getDbClient(c.env);

        const conditions = [eq(taskSections.userId, userId)];
        if (projectIdValue) {
            conditions.push(eq(taskSections.projectId, projectIdValue));
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
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const section = await withRls(db, userId, async (tx) => {
            if (body.projectId) {
                await assertProjectOwnership(tx, userId, body.projectId);
            }

            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(taskSections).where(and(eq(taskSections.id, existingId), eq(taskSections.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(taskSections)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
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

        return c.json({ data: { id } });
    });
