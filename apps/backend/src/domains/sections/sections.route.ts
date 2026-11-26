import { Hono } from "hono";
import { eq, and, asc, sql } from "drizzle-orm";
import { getIdempotencyKey, createOnce } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { projects, taskSections } from "../../db/schema";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { assertProjectOwnership } from "../../platform/ownership";
import { listAccess, noteAudience, noteChange, requireEdit, requireOwner } from "../../platform/list-access";
import { apiValidator } from "../../platform/validation";
import { uuidParamSchema } from "@cadence/contracts/common";
import { createSectionSchema, updateSectionSchema, sectionQuerySchema } from "@cadence/contracts/section";

export const sectionRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", createSectionSchema), async (c) => {
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);

        const { section, access } = await withCallerRls(c, async (tx, callerId) => {
            const access = body.projectId ? await listAccess(tx, callerId, body.projectId) : null;
            requireEdit(access);
            const userId = access?.ownerId ?? callerId;
            if (body.projectId) {
                await assertProjectOwnership(tx, userId, body.projectId);
            }

            const section = await createOnce(
                tx,
                callerId,
                idempotencyKey,
                (id) =>
                    tx
                        .select()
                        .from(taskSections)
                        .where(and(eq(taskSections.id, id), eq(taskSections.userId, userId))),
                () =>
                    tx
                        .insert(taskSections)
                        .values({ ...body, userId })
                        .returning(),
            );
            return { section, access };
        });

        noteAudience(c, access);
        if (access) noteChange(c, { type: "list", listId: access.listId });
        return c.json({ data: section }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateSectionSchema), async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");

        const { updated, access } = await withCallerRls(c, async (tx, callerId) => {
            const [found] = await tx
                .select({ userId: taskSections.userId, projectId: taskSections.projectId })
                .from(taskSections)
                .where(eq(taskSections.id, id));
            throwIfNotFound(found, "Section");
            const access = found.projectId ? await listAccess(tx, callerId, found.projectId) : null;
            requireEdit(access);
            const [row] = await tx
                .update(taskSections)
                .set(body)
                .where(and(eq(taskSections.id, id), eq(taskSections.userId, found.userId)))
                .returning();
            return { updated: row, access };
        });

        throwIfNotFound(updated, "Section");
        noteAudience(c, access);
        if (access) noteChange(c, { type: "list", listId: access.listId });
        return c.json({ data: updated });
    })
    .get("/", apiValidator("query", sectionQuerySchema), async (c) => {
        const { projectId } = c.req.valid("query");
        const projectIdValue = projectId ?? null;

        const rows = await withCallerRls(c, async (tx, callerId) => {
            const [list] = projectId
                ? await tx.select({ ownerId: projects.userId }).from(projects).where(eq(projects.id, projectId))
                : [];
            const userId = list?.ownerId ?? callerId;
            const conditions = [eq(taskSections.userId, userId)];
            if (projectIdValue) {
                conditions.push(eq(taskSections.projectId, projectIdValue));
            } else {
                conditions.push(sql`${taskSections.projectId} IS NULL`);
            }

            return tx
                .select()
                .from(taskSections)
                .where(and(...conditions))
                .orderBy(asc(taskSections.orderIndex));
        });

        return c.json({ data: rows });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const access = await withCallerRls(c, async (tx, userId) => {
            const [found] = await tx
                .select({ projectId: taskSections.projectId })
                .from(taskSections)
                .where(eq(taskSections.id, id));
            const access = found?.projectId ? await listAccess(tx, userId, found.projectId) : null;
            requireOwner(access);
            const result = await tx
                .delete(taskSections)
                .where(and(eq(taskSections.id, id), eq(taskSections.userId, userId)))
                .returning();
            if (result.length === 0) throw new AppError(404, "NOT_FOUND", "Section not found");
            return access;
        });

        noteAudience(c, access);
        if (access) noteChange(c, { type: "list", listId: access.listId });
        return c.json({ data: { id } });
    });
