import { tool } from "ai";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { projects, taskSections } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, MAX_LIST_LIMIT } from "./index";
import { toMinimalProject } from "./projections";
import { createProject } from "../../projects/projects.service";

export const projectTools = (env: Env, userId: string, _ctx?: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_projects: tool({
        description: "The user's lists (projects in code), each with its sections in board order. more:true when cut off.",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_projects", userId, async () => {
                const db = getDbClient(env);
                const { rows, sections } = await withRls(db, userId, async (tx) => ({
                    rows: await tx
                        .select({
                            id: projects.id,
                            name: projects.name,
                            emoji: projects.emoji,
                            colorAccent: projects.colorAccent,
                        })
                        .from(projects)
                        .where(eq(projects.userId, userId))
                        .orderBy(desc(projects.createdAt))
                        .limit(MAX_LIST_LIMIT + 1),
                    sections: await tx
                        .select({ id: taskSections.id, name: taskSections.name, projectId: taskSections.projectId })
                        .from(taskSections)
                        .where(eq(taskSections.userId, userId))
                        .orderBy(taskSections.orderIndex)
                        .limit(200),
                }));
                return {
                    projects: rows.slice(0, MAX_LIST_LIMIT).map((row) => toMinimalProject(row, sections)),
                    more: rows.length > MAX_LIST_LIMIT || undefined,
                };
            }),
    }),

    // ── W ──────────────────────────────────────────────────────────────────
    create_project: tool({
        description: "Creates a list. Returns its projectId, for putting tasks in it.",
        inputSchema: z.object({
            name: z.string().min(1).max(200),
            emoji: z.string().max(8).optional(),
            colorAccent: z
                .string()
                .max(40)
                .optional()
                .describe("Accent token, e.g. 'luminous-amber'."),
        }),
        execute: async (input, { toolCallId }) =>
            safeExecute("create_project", userId, async () => {
                const row = await withRls(getDbClient(env), userId, (tx) => createProject(tx, userId, input, toolCallId));
                return { projectId: row.id, name: row.name };
            }),
    }),
});
