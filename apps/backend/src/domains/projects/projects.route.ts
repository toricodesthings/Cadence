import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { getIdempotencyKey, checkIdempotency, recordMutation } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { projects } from "../../db/schema";
import { insertProjectSchema, updateProjectSchema } from "@cadence/contracts/project";
import { uuidParamSchema } from "../../types/api";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";

export const projectRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", insertProjectSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const project = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(projects).where(and(eq(projects.id, existingId), eq(projects.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(projects)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: project }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateProjectSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, (tx) =>
            tx
                .update(projects)
                .set({
                    ...body,
                })
                .where(and(eq(projects.id, id), eq(projects.userId, userId)))
                .returning(),
        );

        throwIfNotFound(updated, "Project");

        return c.json({ data: updated });
    })
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const userProjects = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(projects)
                .where(eq(projects.userId, userId))
                .orderBy(projects.createdAt),
        );

        return c.json({ data: userProjects });
    })
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [project] = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(projects)
                .where(and(eq(projects.id, id), eq(projects.userId, userId))),
        );

        throwIfNotFound(project, "Project");

        return c.json({ data: project });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [deleted] = await withRls(db, userId, (tx) =>
            tx
                .delete(projects)
                .where(and(eq(projects.id, id), eq(projects.userId, userId)))
                .returning(),
        );

        throwIfNotFound(deleted, "Project");

        return c.json({ data: deleted });
    });
