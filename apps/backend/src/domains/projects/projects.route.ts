import { Hono } from "hono";
import { getIdempotencyKey } from "../../platform/idempotency";
import { withCallerRls } from "../../platform/caller-rls";
import { insertProjectSchema, updateProjectSchema } from "@cadence/contracts/project";
import { uuidParamSchema } from "@cadence/contracts/common";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { listAccess, noteAudience, noteChange, requireOwner } from "../../platform/list-access";
import { apiValidator } from "../../platform/validation";
import { evictFromPresence } from "../sharing/list-presence";
import { createProject, deleteProject, readProjects, updateProject } from "./projects.service";

export const projectRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/", apiValidator("json", insertProjectSchema), async (c) => {
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);

        const project = await withCallerRls(c, (tx, userId) => createProject(tx, userId, body, idempotencyKey));

        return c.json({ data: { ...project, access: "owner" as const, members: [] } }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateProjectSchema), async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");

        const { updated, access } = await withCallerRls(c, async (tx, userId) => {
            const access = await listAccess(tx, userId, id);
            requireOwner(access);
            await updateProject(tx, userId, id, body);
            const [updated] = await readProjects(tx, userId, id);
            return { updated, access };
        });

        noteAudience(c, access);
        noteChange(c, { type: "list", listId: id });
        return c.json({ data: updated });
    })
    .get("/", async (c) => {
        const userProjects = await withCallerRls(c, (tx, userId) => readProjects(tx, userId));

        return c.json({ data: userProjects });
    })
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const [project] = await withCallerRls(c, (tx, userId) => readProjects(tx, userId, id));

        throwIfNotFound(project, "Project");

        return c.json({ data: project });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const { project, access } = await withCallerRls(c, async (tx, userId) => {
            const access = await listAccess(tx, userId, id);
            requireOwner(access);
            return { ...(await deleteProject(tx, userId, id)), access };
        });

        noteAudience(c, access);
        noteChange(c, { type: "list", listId: id });
        await evictFromPresence(c.env, id);
        return c.json({ data: { ...project, access: "owner" as const, members: [] } });
    });
