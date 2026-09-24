import { tool } from "ai";
import { z } from "zod";
import { and, eq, desc, ilike, inArray } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { projects, taskSections } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, MAX_LIST_LIMIT } from "./index";
import { toMinimalProject } from "./projections";
import { createProject } from "../../projects/projects.service";

const SECTION_LIMIT = 200;
const namePattern = (query: string) => `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
const offsetSchema = z.number().int().min(0).max(2_147_483_647).optional();

export const projectTools = (env: Env, userId: string, _ctx?: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_projects: tool({
        description: "The user's lists (projects in code), with their sections, including empty ones. " +
            "Search list names with query or select one projectId. nextOffset pages lists. " +
            "sectionsMore means sections are incomplete: select a projectId, then search sectionQuery or page with nextSectionOffset.",
        inputSchema: z.object({
            query: z.string().trim().min(1).max(200).optional().describe("Words in the list name, case-insensitive."),
            projectId: z.uuid().optional().describe("One list with its sections."),
            offset: offsetSchema.describe("List offset from nextOffset; omit for the first page."),
            sectionQuery: z.string().trim().min(1).max(200).optional().describe("Words in a section name; requires projectId."),
            sectionOffset: offsetSchema.describe("Section offset from nextSectionOffset; requires projectId."),
        }).refine((v) => v.projectId || (v.sectionQuery === undefined && v.sectionOffset === undefined), "Section search/paging requires projectId"),
        execute: async ({ query, projectId, offset = 0, sectionQuery, sectionOffset = 0 }) =>
            safeExecute("get_projects", userId, async () => {
                const db = getDbClient(env);
                const { rows, sections } = await withRls(db, userId, async (tx) => {
                    const rows = await tx
                        .select({
                            id: projects.id,
                            name: projects.name,
                            emoji: projects.emoji,
                            colorAccent: projects.colorAccent,
                        })
                        .from(projects)
                        .where(and(eq(projects.userId, userId), projectId ? eq(projects.id, projectId) : undefined,
                            query ? ilike(projects.name, namePattern(query)) : undefined))
                        .orderBy(desc(projects.createdAt), projects.id)
                        .limit(MAX_LIST_LIMIT + 1)
                        .offset(offset);
                    const ids = rows.slice(0, MAX_LIST_LIMIT).map((row) => row.id);
                    const sections = ids.length ? await tx
                        .select({ id: taskSections.id, name: taskSections.name, projectId: taskSections.projectId })
                        .from(taskSections)
                        .where(and(eq(taskSections.userId, userId), inArray(taskSections.projectId, ids),
                            sectionQuery ? ilike(taskSections.name, namePattern(sectionQuery)) : undefined))
                        .orderBy(taskSections.orderIndex, taskSections.id)
                        .limit(SECTION_LIMIT + 1)
                        .offset(sectionOffset) : [];
                    return { rows, sections };
                });
                return {
                    projects: rows.slice(0, MAX_LIST_LIMIT).map((row) => toMinimalProject(row, sections.slice(0, SECTION_LIMIT))),
                    ...(rows.length > MAX_LIST_LIMIT && { more: true, nextOffset: offset + MAX_LIST_LIMIT }),
                    ...(sections.length > SECTION_LIMIT && {
                        sectionsMore: true,
                        ...(projectId && { nextSectionOffset: sectionOffset + SECTION_LIMIT }),
                    }),
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
