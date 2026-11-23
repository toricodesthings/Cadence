import { tool } from "ai";
import { ACCENT_COLORS } from "@cadence/contracts/constants";
import { z } from "zod";
import { and, asc, count, eq, desc, exists, ilike, inArray, isNull, max, ne, or, sql } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { projects, taskSections, tasks } from "../../../db/schema";
import { memberView } from "../../../db/schema/columns";
import { withRls } from "../../../platform/rls";
import { throwIfNotFound } from "../../../platform/errors";
import { assertProjectOwnership } from "../../../platform/ownership";
import type { Tx } from "../../../types/db";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, once, MAX_LIST_LIMIT } from "./index";
import { toMinimalProject } from "./projections";
import { assertNotShared, sharedListPeople, sharedProjectMeta } from "./shared-guard";
import { createProject, deleteProject, updateProject } from "../../projects/projects.service";
import { checkIdempotency } from "../../../platform/idempotency";
import { createSectionSchema } from "@cadence/contracts/section";
import { insertProjectSchema } from "@cadence/contracts/project";

const SECTION_LIMIT = 200;
const namePattern = (query: string) => `%${query.replace(/[\\%_]/g, "\\$&")}%`;
const offsetSchema = z.number().int().min(0).max(2_147_483_647).optional();
const sectionName = createSectionSchema.shape.name;
const colorAccent = z.enum(ACCENT_COLORS);

async function findSection(tx: Tx, userId: string, sectionId: string) {
    const [row] = await tx
        .select({ id: taskSections.id, name: taskSections.name, projectId: taskSections.projectId })
        .from(taskSections)
        .where(and(eq(taskSections.id, sectionId), eq(taskSections.userId, userId)));
    throwIfNotFound(row, "Section");
    return row;
}

export const projectTools = (env: Env, userId: string, _ctx?: AgentContext) => {
    const runWrite = <T>(name: string, toolCallId: string, fn: (tx: Tx) => Promise<{ result: T; id: string }>) =>
        safeExecute(name, userId, async () =>
            withRls(getDbClient(env), userId, (tx) => once(tx, userId, toolCallId, () => fn(tx))),
        );

    return {
        // ── R ──────────────────────────────────────────────────────────────────
        get_projects: tool({
            description:
                "The user's lists (projects in code), with their sections, including empty ones. " +
                'Find a list or section by name with query (an exact name comes first; "COMP3005" finds the list holding that section) or select one projectId. ' +
                "Sections come in their order; openTasks = open tasks in it. Pages with offset: more:true and nextOffset (with projectId it pages that list's sections). " +
                "partial:true = that list's sections were cut: select its projectId, then search sectionQuery or page.",
            inputSchema: z
                .object({
                    query: z
                        .string()
                        .trim()
                        .min(1)
                        .max(200)
                        .optional()
                        .describe("Words in the list name or one of its section names, case-insensitive."),
                    projectId: z.uuid().optional().describe("One list with its sections."),
                    offset: offsetSchema.describe("From nextOffset; omit for the first page."),
                    sectionQuery: z
                        .string()
                        .trim()
                        .min(1)
                        .max(200)
                        .optional()
                        .describe("Words in a section name; requires projectId."),
                })
                .refine((v) => v.projectId || v.sectionQuery === undefined, "sectionQuery requires projectId"),
            execute: async ({ query, projectId, offset = 0, sectionQuery }) =>
                safeExecute("get_projects", userId, async () => {
                    const db = getDbClient(env);
                    // With projectId, offset pages that list's sections; without it, the lists.
                    const listOffset = projectId ? 0 : offset;
                    const sectionOffset = projectId ? offset : 0;
                    const { rows, sections, counts, sectionTotals, peopleMap } = await withRls(
                        db,
                        userId,
                        async (tx) => {
                            const rows = await tx
                                .select({
                                    id: projects.id,
                                    name: projects.name,
                                    emoji: projects.emoji,
                                    colorAccent: projects.colorAccent,
                                })
                                .from(projects)
                                .where(
                                    and(
                                        or(eq(projects.userId, userId), inArray(projects.id, memberView)),
                                        projectId ? eq(projects.id, projectId) : undefined,
                                        // Each word in the list's name or a section's: "comp 3005" finds University › COMP3005.
                                        ...(query?.split(/\s+/).slice(0, 8) ?? []).map((word) =>
                                            or(
                                                ilike(projects.name, namePattern(word)),
                                                exists(
                                                    tx
                                                        .select({ id: taskSections.id })
                                                        .from(taskSections)
                                                        .where(
                                                            and(
                                                                eq(taskSections.projectId, projects.id),
                                                                ilike(taskSections.name, namePattern(word)),
                                                            ),
                                                        ),
                                                ),
                                            ),
                                        ),
                                    ),
                                )
                                .orderBy(
                                    ...(query ? [desc(sql`lower(${projects.name}) = lower(${query})`)] : []),
                                    desc(projects.createdAt),
                                    projects.id,
                                )
                                .limit(MAX_LIST_LIMIT + 1)
                                .offset(listOffset);
                            const ids = rows.slice(0, MAX_LIST_LIMIT).map((row) => row.id);
                            const sections = ids.length
                                ? await tx
                                      .select({
                                          id: taskSections.id,
                                          name: taskSections.name,
                                          projectId: taskSections.projectId,
                                      })
                                      .from(taskSections)
                                      .where(
                                          and(
                                              or(
                                                  eq(taskSections.userId, userId),
                                                  inArray(taskSections.projectId, memberView),
                                              ),
                                              inArray(taskSections.projectId, ids),
                                              sectionQuery
                                                  ? ilike(taskSections.name, namePattern(sectionQuery))
                                                  : undefined,
                                          ),
                                      )
                                      .orderBy(taskSections.orderIndex, taskSections.id)
                                      .limit(SECTION_LIMIT + 1)
                                      .offset(sectionOffset)
                                : [];
                            // Open tasks per list and per section, one grouped query.
                            const counted = ids.length
                                ? await tx
                                      .select({ projectId: tasks.projectId, sectionId: tasks.sectionId, n: count() })
                                      .from(tasks)
                                      .where(
                                          and(
                                              or(eq(tasks.userId, userId), inArray(tasks.projectId, memberView)),
                                              inArray(tasks.projectId, ids),
                                              inArray(tasks.state, ["ACTIVE", "WAITING"]),
                                              ne(tasks.interactionMode, "timetable"),
                                          ),
                                      )
                                      .groupBy(tasks.projectId, tasks.sectionId)
                                : [];
                            const counts = new Map<string, number>();
                            for (const { projectId: list, sectionId, n } of counted) {
                                counts.set(list!, (counts.get(list!) ?? 0) + n);
                                if (sectionId) counts.set(`${list}|${sectionId}`, n);
                            }
                            // Sections per list, so a list whose sections the cap cut says so (partial).
                            const sectionTotals =
                                !projectId && sections.length > SECTION_LIMIT
                                    ? new Map(
                                          (
                                              await tx
                                                  .select({ projectId: taskSections.projectId, n: count() })
                                                  .from(taskSections)
                                                  .where(
                                                      and(
                                                          or(
                                                              eq(taskSections.userId, userId),
                                                              inArray(taskSections.projectId, memberView),
                                                          ),
                                                          inArray(taskSections.projectId, ids),
                                                          sectionQuery
                                                              ? ilike(taskSections.name, namePattern(sectionQuery))
                                                              : undefined,
                                                      ),
                                                  )
                                                  .groupBy(taskSections.projectId)
                                          ).map((row) => [row.projectId, row.n]),
                                      )
                                    : undefined;
                            const peopleMap = await sharedListPeople(tx, ids);
                            return { rows, sections, counts, sectionTotals, peopleMap };
                        },
                    );
                    const cut = sections.length > SECTION_LIMIT;
                    return {
                        projects: rows.slice(0, MAX_LIST_LIMIT).map((row) => {
                            const project = toMinimalProject(
                                row,
                                sections.slice(0, SECTION_LIMIT),
                                counts,
                                sharedProjectMeta(peopleMap, row.id, userId),
                            );
                            return project.sections.length < (sectionTotals?.get(row.id) ?? 0)
                                ? { ...project, partial: true as const }
                                : project;
                        }),
                        ...(projectId
                            ? cut && { more: true, nextOffset: sectionOffset + SECTION_LIMIT }
                            : rows.length > MAX_LIST_LIMIT && { more: true, nextOffset: listOffset + MAX_LIST_LIMIT }),
                    };
                }),
        }),

        // ── W ──────────────────────────────────────────────────────────────────
        create_project: tool({
            description:
                "Creates a list, optionally with its sections in order. Returns its projectId and sectionIds, for putting tasks in it.",
            inputSchema: z.object({
                name: insertProjectSchema.shape.name,
                emoji: z.string().max(8).optional(),
                colorAccent: colorAccent.optional(),
                sections: z.array(sectionName).max(20).optional().describe("Section names, in order."),
            }),
            execute: async ({ sections: names = [], ...input }, { toolCallId }) =>
                safeExecute("create_project", userId, async () =>
                    withRls(getDbClient(env), userId, async (tx) => {
                        const replayed = await checkIdempotency(tx, userId, toolCallId);
                        const row = await createProject(tx, userId, input, toolCallId);
                        const sections =
                            replayed || !names.length
                                ? []
                                : await tx
                                      .insert(taskSections)
                                      .values(
                                          names.map((name, orderIndex) => ({
                                              userId,
                                              projectId: row.id,
                                              name,
                                              orderIndex,
                                          })),
                                      )
                                      .returning({ sectionId: taskSections.id, name: taskSections.name });
                        return {
                            projectId: row.id,
                            name: row.name,
                            ...(sections.length && { sections }),
                            ...(replayed && { deduped: true }),
                        };
                    }),
                ),
        }),

        // ── W ──────────────────────────────────────────────────────────────────
        create_sections: tool({
            description:
                "Adds sections to the end of a list, in the order given. Returns each sectionId, for placing tasks in it.",
            inputSchema: z.object({
                projectId: z.uuid(),
                names: z.array(sectionName).min(1).max(20),
            }),
            execute: async ({ projectId, names }, { toolCallId }) =>
                runWrite("create_sections", toolCallId, async (tx) => {
                    await assertNotShared(tx, { projectIds: [projectId] });
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
        }),

        // ── U ──────────────────────────────────────────────────────────────────
        update_project: tool({
            description: "Renames a list or changes its emoji (null removes it) or colour. Send only what changes.",
            inputSchema: z.object({
                projectId: z.uuid(),
                patch: z
                    .object({
                        name: insertProjectSchema.shape.name.optional(),
                        emoji: z.string().max(8).nullable().optional(),
                        colorAccent: colorAccent.optional(),
                    })
                    .refine((v) => Object.values(v).some((value) => value !== undefined), "Nothing to change"),
            }),
            execute: async ({ projectId, patch }, { toolCallId }) =>
                runWrite("update_project", toolCallId, async (tx) => {
                    await assertNotShared(tx, { projectIds: [projectId] });
                    const row = await updateProject(tx, userId, projectId, patch);
                    return { result: toMinimalProject(row), id: row.id };
                }),
        }),

        update_section: tool({
            description:
                "Renames a section and/or moves it to a position in its list (1 = first). Its tasks stay in it.",
            inputSchema: z
                .object({
                    sectionId: z.uuid(),
                    name: sectionName.optional(),
                    position: z
                        .number()
                        .int()
                        .min(1)
                        .optional()
                        .describe("Where it lands among the list's sections; past the end = last."),
                })
                .refine((v) => v.name !== undefined || v.position !== undefined, "Send a name or a position"),
            execute: async ({ sectionId, name, position }, { toolCallId }) =>
                runWrite("update_section", toolCallId, async (tx) => {
                    await assertNotShared(tx, { sectionIds: [sectionId] });
                    const section = await findSection(tx, userId, sectionId);
                    if (name !== undefined) {
                        await tx
                            .update(taskSections)
                            .set({ name })
                            .where(and(eq(taskSections.id, sectionId), eq(taskSections.userId, userId)));
                    }
                    if (position !== undefined) {
                        // Renumber the list's sections 0..n with this one at its new place.
                        const siblings = await tx
                            .select({ id: taskSections.id })
                            .from(taskSections)
                            .where(
                                and(
                                    eq(taskSections.userId, userId),
                                    section.projectId
                                        ? eq(taskSections.projectId, section.projectId)
                                        : isNull(taskSections.projectId),
                                ),
                            )
                            .orderBy(asc(taskSections.orderIndex), asc(taskSections.createdAt));
                        const order = siblings.map((row) => row.id).filter((id) => id !== sectionId);
                        order.splice(Math.min(position - 1, order.length), 0, sectionId);
                        for (const [orderIndex, id] of order.entries()) {
                            await tx
                                .update(taskSections)
                                .set({ orderIndex })
                                .where(and(eq(taskSections.id, id), eq(taskSections.userId, userId)));
                        }
                    }
                    return { result: { sectionId, name: name ?? section.name, position }, id: sectionId };
                }),
        }),

        // ── D ──────────────────────────────────────────────────────────────────
        delete_project: tool({
            description:
                "Deletes a list for good, with its sections (can't be undone). Its tasks are kept with no list, " +
                'or with tasks:"trash" its open ones go to Trash. Echo the name. Returns the counts.',
            inputSchema: z.object({
                projectId: z.uuid(),
                name: z.string().max(200),
                tasks: z.enum(["keep", "trash"]).default("keep"),
            }),
            execute: async ({ projectId, tasks: fate }, { toolCallId }) =>
                runWrite("delete_project", toolCallId, async (tx) => {
                    await assertNotShared(tx, { projectIds: [projectId] });
                    const { project, tasksTrashed, tasksUnlisted } = await deleteProject(tx, userId, projectId, {
                        trashOpenTasks: fate === "trash",
                    });
                    return { result: { deleted: project.name, tasksUnlisted, tasksTrashed }, id: userId };
                }),
        }),

        delete_section: tool({
            description:
                "Deletes a section for good. Its tasks are kept, unsectioned in the same list. Returns how many moved.",
            inputSchema: z.object({ sectionId: z.uuid() }),
            execute: async ({ sectionId }, { toolCallId }) =>
                runWrite("delete_section", toolCallId, async (tx) => {
                    await assertNotShared(tx, { sectionIds: [sectionId] });
                    const section = await findSection(tx, userId, sectionId);
                    const [{ tasksUnsectioned }] = await tx
                        .select({ tasksUnsectioned: count() })
                        .from(tasks)
                        .where(and(eq(tasks.userId, userId), eq(tasks.sectionId, sectionId)));
                    // The foreign key sets each task's section to null.
                    await tx
                        .delete(taskSections)
                        .where(and(eq(taskSections.id, sectionId), eq(taskSections.userId, userId)));
                    return { result: { deleted: section.name, tasksUnsectioned }, id: sectionId };
                }),
        }),
    };
};
