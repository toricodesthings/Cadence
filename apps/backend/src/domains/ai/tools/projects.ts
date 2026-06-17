import { tool } from "ai";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { projects } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute } from "./index";
import { toMinimalProject } from "./projections";

export const projectTools = (env: Env, userId: string, _ctx?: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_projects: tool({
        description:
            "READ-ONLY. List the user's projects (id, name, emoji, accent) for grouping/labeling " +
            "context. No task contents returned.",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_projects", userId, async () => {
                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select({
                            id: projects.id,
                            name: projects.name,
                            emoji: projects.emoji,
                            colorAccent: projects.colorAccent,
                        })
                        .from(projects)
                        .where(eq(projects.userId, userId))
                        .orderBy(desc(projects.createdAt))
                        .limit(50),
                );
                return { projects: rows.map(toMinimalProject) };
            }),
    }),

    // ── P (proposal — NO DB WRITE) ──────────────────────────────────────────
    propose_create_project: tool({
        description:
            "PROPOSAL ONLY — does NOT create anything. Validates a drafted project (e.g. when " +
            "clustering related inbox captures) and returns it for confirmation; the project is " +
            "created later via the REST API after explicit approval.",
        inputSchema: z.object({
            name: z.string().min(1).max(200).describe("Project name."),
            emoji: z.string().max(8).optional().describe("Optional emoji icon."),
            colorAccent: z
                .string()
                .max(40)
                .optional()
                .describe("Tailwind accent token, e.g. 'luminous-amber'."),
        }),
    }),
});
