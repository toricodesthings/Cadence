import { tool } from "ai";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { savedFocusViews } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import { throwIfNotFound } from "../../../platform/errors";
import type { Env } from "../../../types/env";
import type { Tx } from "../../../types/db";
import type { AgentContext } from "./index";
import { safeExecute, once } from "./index";
import { focusViewDefinitionSchema, savedFocusViewInputSchema, type FocusViewDefinitionInput } from "@cadence/contracts/settings";

/** A new view's filters before the model's; the app's composer starts from the same. */
const DEFAULT_DEFINITION: FocusViewDefinitionInput = {
    states: ["ACTIVE"],
    projectIds: [],
    tagIds: [],
    needsDate: false,
    needsProject: false,
    priorityMin: null,
    effortMin: null,
    effortMax: null,
    durationMaxMinutes: null,
    dueWindow: null,
    waitingOnly: false,
    missingStructureOnly: false,
    sortMode: "smart",
};

const d = focusViewDefinitionSchema.shape;
const filtersSchema = z.object({
    states: d.states.optional().describe("Default [ACTIVE]."),
    projectIds: d.projectIds.optional().describe("Only these lists."),
    tagIds: d.tagIds.optional().describe("Only tasks with any of these tags."),
    needsDate: d.needsDate.optional().describe("Only tasks with no date."),
    needsProject: d.needsProject.optional().describe("Only tasks with no list."),
    priorityMin: d.priorityMin.optional().describe("Urgent: at least this priority (0–4)."),
    effortMin: d.effortMin.optional().describe("Demanding: at least this effort (1–3). Effort is difficulty, not length."),
    effortMax: d.effortMax.optional().describe("Easy: at most this effort (1–3). Effort is difficulty, not length."),
    durationMaxMinutes: d.durationMaxMinutes.optional().describe("Short: estimated at most this many minutes. Length, not difficulty; tasks without an estimate are excluded."),
    dueWindow: d.dueWindow.optional().describe("Due by then (undated stay in); overdue = only overdue."),
    waitingOnly: d.waitingOnly.optional(),
    missingStructureOnly: d.missingStructureOnly.optional().describe("Tasks missing a date or a list."),
    sortMode: d.sortMode.optional().describe("smart (date first), priority or manual."),
});

/**
 * A stored definition read leniently: missing keys take the defaults and keys the
 * schema doesn't know (older views) are dropped. Undefined when it still can't be read.
 */
export function readFocusView(definition: unknown): FocusViewDefinitionInput | undefined {
    const parsed = focusViewDefinitionSchema.safeParse({ ...DEFAULT_DEFINITION, ...(definition as object | null) });
    return parsed.success ? parsed.data : undefined;
}

/** A view row for the model: its name, pin and only the filters it sets. */
export function toMinimalFocusView(row: { id: string; name: string; isPinned: boolean; definition: unknown }) {
    const parsed = readFocusView(row.definition);
    const filters = parsed
        ? Object.fromEntries(Object.entries(parsed).filter(([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(DEFAULT_DEFINITION[key as keyof FocusViewDefinitionInput])))
        : undefined;
    return { id: row.id, name: row.name, pinned: row.isPinned || undefined, filters };
}

export const focusViewTools = (env: Env, userId: string, _ctx: AgentContext) => {
    const find = async (tx: Tx, id: string) => {
        const [row] = await tx
            .select()
            .from(savedFocusViews)
            .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)))
            .for("update");
        throwIfNotFound(row, "Focus view");
        return row;
    };

    return {
        // ── R ──────────────────────────────────────────────────────────────────
        get_focus_views: tool({
            description:
                "The user's saved focus views (named task filters on Today, Upcoming, lists and Capture), pinned first, " +
                "each with the filters it sets. get_tasks focusViewId shows a view's tasks.",
            inputSchema: z.object({}),
            execute: async () =>
                safeExecute("get_focus_views", userId, async () => {
                    const rows = await withRls(getDbClient(env), userId, (tx) =>
                        tx
                            .select({ id: savedFocusViews.id, name: savedFocusViews.name, isPinned: savedFocusViews.isPinned, definition: savedFocusViews.definition })
                            .from(savedFocusViews)
                            .where(eq(savedFocusViews.userId, userId))
                            .orderBy(desc(savedFocusViews.isPinned), asc(savedFocusViews.orderIndex), asc(savedFocusViews.createdAt))
                            .limit(50),
                    );
                    return { views: rows.map(toMinimalFocusView) };
                }),
        }),

        // ── W ──────────────────────────────────────────────────────────────────
        create_focus_view: tool({
            description: "Saves a focus view: a name and the filters it sets (the rest stay open). Returns its focusViewId.",
            inputSchema: z.object({
                name: savedFocusViewInputSchema.shape.name,
                filters: filtersSchema,
                pinned: z.boolean().optional().describe("Pin it to the top of the views."),
            }),
            execute: async ({ name, filters, pinned }, { toolCallId }) =>
                safeExecute("create_focus_view", userId, async () =>
                    withRls(getDbClient(env), userId, (tx) =>
                        once(tx, userId, toolCallId, async () => {
                            const [row] = await tx
                                .insert(savedFocusViews)
                                .values({ userId, name, definition: { ...DEFAULT_DEFINITION, ...filters }, isPinned: pinned ?? false, source: "composed" })
                                .returning();
                            return { result: { focusViewId: row.id, name: row.name }, id: row.id };
                        }),
                    ),
                ),
        }),

        // ── U ──────────────────────────────────────────────────────────────────
        update_focus_view: tool({
            description: "Renames, pins or unpins a focus view, or changes filters: only the filters sent change.",
            inputSchema: z.object({
                focusViewId: z.uuid(),
                name: savedFocusViewInputSchema.shape.name.optional(),
                filters: filtersSchema.optional(),
                pinned: z.boolean().optional(),
            }).refine((v) => v.name !== undefined || v.filters !== undefined || v.pinned !== undefined, "Nothing to change"),
            execute: async ({ focusViewId, name, filters, pinned }, { toolCallId }) =>
                safeExecute("update_focus_view", userId, async () =>
                    withRls(getDbClient(env), userId, (tx) =>
                        once(tx, userId, toolCallId, async () => {
                            const current = await find(tx, focusViewId);
                            const [row] = await tx
                                .update(savedFocusViews)
                                .set({
                                    ...(name !== undefined && { name }),
                                    ...(pinned !== undefined && { isPinned: pinned }),
                                    ...(filters && { definition: { ...(readFocusView(current.definition) ?? DEFAULT_DEFINITION), ...filters } }),
                                    updatedAt: sql`NOW()`,
                                })
                                .where(and(eq(savedFocusViews.id, focusViewId), eq(savedFocusViews.userId, userId)))
                                .returning();
                            return { result: toMinimalFocusView(row), id: row.id };
                        }),
                    ),
                ),
        }),

        // ── D ──────────────────────────────────────────────────────────────────
        delete_focus_view: tool({
            description: "Deletes a saved focus view for good; no task changes. Echo the name.",
            inputSchema: z.object({ focusViewId: z.uuid(), name: z.string().max(120) }),
            execute: async ({ focusViewId }, { toolCallId }) =>
                safeExecute("delete_focus_view", userId, async () =>
                    withRls(getDbClient(env), userId, (tx) =>
                        once(tx, userId, toolCallId, async () => {
                            const row = await find(tx, focusViewId);
                            await tx.delete(savedFocusViews).where(and(eq(savedFocusViews.id, focusViewId), eq(savedFocusViews.userId, userId)));
                            return { result: { deleted: row.name }, id: userId };
                        }),
                    ),
                ),
        }),
    };
};
