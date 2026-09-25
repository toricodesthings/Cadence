import { tool } from "ai";
import { z } from "zod";
import { and, asc, count, eq, desc, ilike, inArray, isNull, max } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { projects, taskSections, tasks } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import { throwIfNotFound } from "../../../platform/errors";
import { assertProjectOwnership } from "../../../platform/ownership";
import type { Tx } from "../../../types/db";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, once, MAX_LIST_LIMIT } from "./index";
import { toMinimalProject } from "./projections";
import { createProject } from "../../projects/projects.service";
import { createSectionSchema } from "@cadence/contracts/section";
import { insertProjectSchema } from "@cadence/contracts/project";

const SECTION_LIMIT = 200;
const namePattern = (query: string) => `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
const offsetSchema = z.number().int().min(0).max(2_147_483_647).optional();
const sectionName = createSectionSchema.shape.name;

async function findSection(tx: Tx, userId: string, sectionId: string) {
    const [row] = await tx
        .select({ id: taskSections.id, name: taskSections.name, projectId: taskSections.projectId })
        .from(taskSections)
        .where(and(eq(taskSections.id, sectionId), eq(taskSections.userId, userId)));
    throwIfNotFound(row, "Section");
    return row;
}

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
            name: insertProjectSchema.shape.name,
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

    // ── W ──────────────────────────────────────────────────────────────────
    create_sections: tool({
        description: "Adds sections to the end of a list, in the order given. Returns each sectionId, for placing tasks in it.",
        inputSchema: z.object({
            projectId: z.uuid(),
            names: z.array(sectionName).min(1).max(20),
        }),
        execute: async ({ projectId, names }, { toolCallId }) =>
            safeExecute("create_sections", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        await assertProjectOwnership(tx, userId, projectId);
                        const [{ last }] = await tx
                            .select({ last: max(taskSections.orderIndex) })
                            .from(taskSections)
                            .where(and(eq(taskSections.userId, userId), eq(taskSections.projectId, projectId)));
                        const start = (last ?? -1) + 1;
                        const rows = await tx
                            .insert(taskSections)
                            .values(names.map((name, i) => ({ userId, projectId, name, orderIndex: start + i })))
                            .returning({ sectionId: taskSections.id, name: taskSections.name });
                        return { result: { sections: rows }, id: rows[0].sectionId };
                    }),
                ),
            ),
    }),

    // ── U ──────────────────────────────────────────────────────────────────
    update_section: tool({
        description: "Renames a section and/or moves it to a position in its list (1 = first). Its tasks stay in it.",
        inputSchema: z.object({
            sectionId: z.uuid(),
            name: sectionName.optional(),
            position: z.number().int().min(1).optional().describe("Where it lands among the list's sections; past the end = last."),
        }).refine((v) => v.name !== undefined || v.position !== undefined, "Send a name or a position"),
        execute: async ({ sectionId, name, position }, { toolCallId }) =>
            safeExecute("update_section", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const section = await findSection(tx, userId, sectionId);
                        if (name !== undefined) {
                            await tx.update(taskSections).set({ name }).where(and(eq(taskSections.id, sectionId), eq(taskSections.userId, userId)));
                        }
                        if (position !== undefined) {
                            // Renumber the list's sections 0..n with this one at its new place.
                            const siblings = await tx
                                .select({ id: taskSections.id })
                                .from(taskSections)
                                .where(and(
                                    eq(taskSections.userId, userId),
                                    section.projectId ? eq(taskSections.projectId, section.projectId) : isNull(taskSections.projectId),
                                ))
                                .orderBy(asc(taskSections.orderIndex), asc(taskSections.createdAt));
                            const order = siblings.map((row) => row.id).filter((id) => id !== sectionId);
                            order.splice(Math.min(position - 1, order.length), 0, sectionId);
                            for (const [orderIndex, id] of order.entries()) {
                                await tx.update(taskSections).set({ orderIndex }).where(and(eq(taskSections.id, id), eq(taskSections.userId, userId)));
                            }
                        }
                        return { result: { sectionId, name: name ?? section.name, position }, id: sectionId };
                    }),
                ),
            ),
    }),

    // ── D ──────────────────────────────────────────────────────────────────
    delete_section: tool({
        description: "Deletes a section for good. Its tasks are kept, unsectioned in the same list. Returns how many moved.",
        inputSchema: z.object({ sectionId: z.uuid() }),
        execute: async ({ sectionId }, { toolCallId }) =>
            safeExecute("delete_section", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const section = await findSection(tx, userId, sectionId);
                        const [{ tasksUnsectioned }] = await tx
                            .select({ tasksUnsectioned: count() })
                            .from(tasks)
                            .where(and(eq(tasks.userId, userId), eq(tasks.sectionId, sectionId)));
                        // The foreign key sets each task's section to null.
                        await tx.delete(taskSections).where(and(eq(taskSections.id, sectionId), eq(taskSections.userId, userId)));
                        return { result: { deleted: section.name, tasksUnsectioned }, id: sectionId };
                    }),
                ),
            ),
    }),
});
