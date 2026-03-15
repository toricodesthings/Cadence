import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { withRls } from "../lib/rls";
import { projects } from "../db/schema";
import { insertProjectSchema, updateProjectSchema } from "../types/project";
import { uuidParamSchema } from "../types/common";
import type { Env } from "../types/env";
import type { AuthVariables } from "../lib/auth";
import { AppError, throwIfNotFound } from "../lib/errors";
import { apiValidator } from "../lib/validation";

export const projectRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", insertProjectSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [project] = await withRls(db, userId, (tx) =>
            tx
                .insert(projects)
                .values({
                    ...body,
                    userId,
                })
                .returning(),
        );

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
