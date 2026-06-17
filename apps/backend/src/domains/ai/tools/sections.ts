import { tool } from "ai";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { taskSections } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute } from "./index";
import { toMinimalSection } from "./projections";

export const sectionTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_sections: tool({
        description:
            "READ-ONLY. List the user's task sections (kanban column headers), optionally scoped " +
            "to one project. Returns id, name, projectId only.",
        inputSchema: z.object({
            projectId: z
                .string()
                .uuid()
                .optional()
                .describe("Restrict to sections within one project."),
        }),
        execute: async ({ projectId }) =>
            safeExecute("get_sections", userId, async () => {
                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select({
                            id: taskSections.id,
                            name: taskSections.name,
                            projectId: taskSections.projectId,
                        })
                        .from(taskSections)
                        .where(
                            projectId
                                ? and(
                                      eq(taskSections.userId, userId),
                                      eq(taskSections.projectId, projectId),
                                  )
                                : eq(taskSections.userId, userId),
                        )
                        .orderBy(taskSections.orderIndex)
                        .limit(50),
                );
                return { sections: rows.map(toMinimalSection) };
            }),
    }),
});
