import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { getIdempotencyKey, checkIdempotency, insertWithClientId, recordMutation } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { taskSections } from "../../db/schema";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { assertProjectOwnership } from "../../platform/ownership";
import { apiValidator } from "../../platform/validation";
import { uuidParamSchema } from "@cadence/contracts/common";
import { createSectionSchema, updateSectionSchema, sectionQuerySchema } from "@cadence/contracts/section";

export const sectionRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", createSectionSchema), async (c) => {
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);

        const section = await withCallerRls(c, async (tx, userId) => {
            if (body.projectId) {
                await assertProjectOwnership(tx, userId, body.projectId);
            }

            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(taskSections).where(and(eq(taskSections.id, existingId), eq(taskSections.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await insertWithClientId(() => tx
                .insert(taskSections)
                .values({ ...body, userId })
                .returning());

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: section }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateSectionSchema), async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");

        const updated = await withCallerRls(c, async (tx, userId) => {
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
    // GET /api/sections?projectId=... — list sections for a project (or unscoped if no projectId)
    .get("/", apiValidator("query", sectionQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { projectId } = c.req.valid("query");
        const projectIdValue = projectId ?? null;

        const conditions = [eq(taskSections.userId, userId)];
        if (projectIdValue) {
            conditions.push(eq(taskSections.projectId, projectIdValue));
        } else {
            conditions.push(sql`${taskSections.projectId} IS NULL`);
        }

        const rows = await withCallerRls(c, async (tx) =>
            tx
                .select()
                .from(taskSections)
                .where(and(...conditions))
                .orderBy(asc(taskSections.orderIndex))
        );

        return c.json({ data: rows });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        await withCallerRls(c, async (tx, userId) => {
            const result = await tx
                .delete(taskSections)
                .where(and(eq(taskSections.id, id), eq(taskSections.userId, userId)))
                .returning();
            if (result.length === 0) throw new AppError(404, "NOT_FOUND", "Section not found");
        });

        return c.json({ data: { id } });
    });
