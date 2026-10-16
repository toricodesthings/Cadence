import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getIdempotencyKey } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { projects } from "../../db/schema";
import { insertProjectSchema, updateProjectSchema } from "@cadence/contracts/project";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { createProject, deleteProject, updateProject } from "./projects.service";

export const projectRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", insertProjectSchema), async (c) => {
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);

        const project = await withCallerRls(c, (tx, userId) => createProject(tx, userId, body, idempotencyKey));

        return c.json({ data: project }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateProjectSchema), async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");

        const updated = await withCallerRls(c, (tx, userId) => updateProject(tx, userId, id, body));

        return c.json({ data: updated });
    })
    .get("/", async (c) => {

        const userProjects = await withCallerRls(c, (tx, userId) =>
            tx
                .select()
                .from(projects)
                .where(eq(projects.userId, userId))
                .orderBy(projects.createdAt),
        );

        return c.json({ data: userProjects });
    })
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const [project] = await withCallerRls(c, (tx, userId) =>
            tx
                .select()
                .from(projects)
                .where(and(eq(projects.id, id), eq(projects.userId, userId))),
        );

        throwIfNotFound(project, "Project");

        return c.json({ data: project });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const { project } = await withCallerRls(c, (tx, userId) => deleteProject(tx, userId, id));

        return c.json({ data: project });
    });
