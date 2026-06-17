import { tool } from "ai";
import { z } from "zod";
import { and, eq, desc, ilike, or } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { tasks, subtasks, taskTags, tags } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import { normalizeTaskFilters } from "../../tasks/task-filters";
import { buildTaskWhereClause } from "../../tasks/tasks.route";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import {
    toMinimalTask,
    toMinimalSubtask,
    toMinimalTag,
    resolveDueWindow,
} from "./projections";

/** Columns returned by the minimal task projection — selected once, reused. */
const minimalTaskColumns = {
    id: tasks.id,
    title: tasks.title,
    state: tasks.state,
    isAllDay: tasks.isAllDay,
    dueDate: tasks.dueDate,
    scheduledStart: tasks.scheduledStart,
    scheduledEnd: tasks.scheduledEnd,
    durationEstimate: tasks.durationEstimate,
    priority: tasks.priority,
    projectId: tasks.projectId,
    waitingOn: tasks.waitingOn,
} as const;

export const taskTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_tasks: tool({
        description:
            "READ-ONLY. Fetch the user's tasks filtered by state, project, due window, " +
            "waiting status, or missing-structure. Returns ids + minimal fields (title, " +
            "dates, state) only — never note bodies. Results are hard-capped server-side.",
        inputSchema: z.object({
            state: z
                .enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"])
                .optional()
                .describe("Task lifecycle state to filter by."),
            dueWindow: z
                .enum(["overdue", "today", "this_week", "this_month"])
                .optional()
                .describe(
                    "Coarse due/scheduled window relative to the user's current local date. " +
                        "'overdue' = anything dated before today.",
                ),
            projectId: z.string().uuid().optional().describe("Restrict to one project."),
            waiting: z
                .boolean()
                .optional()
                .describe("If true, only tasks in the WAITING state (blocked/delegated)."),
            missingStructure: z
                .boolean()
                .optional()
                .describe("If true, only tasks with no date AND no project (need triage)."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(20)
                .describe("Max rows (server caps at 50 regardless)."),
        }),
        execute: async (args) =>
            safeExecute("get_tasks", userId, async () => {
                const limit = clampLimit(args.limit);
                const weekStartsOn = ctx.weekStart === "Monday" ? "Monday" : "Sunday";

                // Reuse the REST filter builder — no copy-pasted WHERE clauses (AGENTS §18).
                const filterInput: Record<string, unknown> = {
                    state: args.waiting ? "WAITING" : args.state,
                    projectId: args.projectId,
                    hasNoDate: args.missingStructure || undefined,
                    hasNoProject: args.missingStructure || undefined,
                };
                if (args.dueWindow) {
                    const w = resolveDueWindow(args.dueWindow, ctx.currentDate, weekStartsOn);
                    if (w.start) {
                        filterInput.scheduledRangeStart = w.start;
                        filterInput.scheduledRangeEnd = w.end;
                    } else {
                        // overdue → no lower bound; use effective-anchor on-or-before.
                        filterInput.effectiveOnOrBeforeDate = w.end;
                    }
                }
                const normalized = normalizeTaskFilters(filterInput as never);
                const conditions = buildTaskWhereClause(userId, normalized);

                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select(minimalTaskColumns)
                        .from(tasks)
                        .where(and(...conditions))
                        .orderBy(desc(tasks.priority), desc(tasks.createdAt))
                        .limit(limit),
                );
                return { tasks: rows.map(toMinimalTask), count: rows.length };
            }),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    get_task_detail: tool({
        description:
            "READ-ONLY. Fetch one task plus its subtasks and tags (ids/titles only, no " +
            "note bodies). Use after get_tasks/search_tasks to inspect structure.",
        inputSchema: z.object({
            taskId: z.string().uuid().describe("The task to inspect."),
        }),
        execute: async ({ taskId }) =>
            safeExecute("get_task_detail", userId, async () => {
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const [row] = await tx
                        .select(minimalTaskColumns)
                        .from(tasks)
                        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
                        .limit(1);
                    if (!row) return { task: null };

                    const subs = await tx
                        .select({
                            id: subtasks.id,
                            title: subtasks.title,
                            isComplete: subtasks.isComplete,
                        })
                        .from(subtasks)
                        .where(eq(subtasks.taskId, taskId))
                        .orderBy(subtasks.orderIndex)
                        .limit(50);

                    const tagRows = await tx
                        .select({ id: tags.id, name: tags.name, color: tags.color })
                        .from(taskTags)
                        .innerJoin(tags, eq(taskTags.tagId, tags.id))
                        .where(eq(taskTags.taskId, taskId))
                        .limit(50);

                    return {
                        task: toMinimalTask(row),
                        subtasks: subs.map(toMinimalSubtask),
                        tags: tagRows.map(toMinimalTag),
                    };
                });
            }),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    search_tasks: tool({
        description:
            "READ-ONLY. Case-insensitive keyword search over task titles (and note text). " +
            "Returns minimal fields only, hard-capped server-side.",
        inputSchema: z.object({
            query: z.string().min(1).max(200).describe("Keyword(s) to match in title/notes."),
            limit: z.number().int().min(1).max(50).default(20).describe("Max rows (capped at 50)."),
        }),
        execute: async ({ query, limit }) =>
            safeExecute("search_tasks", userId, async () => {
                const cap = clampLimit(limit);
                const pattern = `%${query}%`;
                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select(minimalTaskColumns)
                        .from(tasks)
                        .where(
                            and(
                                eq(tasks.userId, userId),
                                or(ilike(tasks.title, pattern), ilike(tasks.content, pattern)),
                            ),
                        )
                        .orderBy(desc(tasks.createdAt))
                        .limit(cap),
                );
                return { tasks: rows.map(toMinimalTask), count: rows.length };
            }),
    }),

    // ── P (proposal — CLIENT-SIDE HITL, NO execute) ──────────────────────────
    // propose_* tools deliberately have NO `execute`. That keeps the tool part in
    // `input-available` so the client renders an interactive approval card from
    // `part.input` (the draft) and commits via the REST API on confirm. A server
    // `execute` would mark the part `output-available` immediately and the card
    // would render already-resolved. The model only proposes; the app commits.
    propose_create_task: tool({
        description:
            "PROPOSAL ONLY — does NOT create anything. Drafts a task for the user to confirm; " +
            "the actual task is created later via the REST API after explicit approval. " +
            "Use YYYY-MM-DD for all-day dueDate values; use ISO datetimes with Z or +/-HH:MM offsets for time blocks. " +
            "Duration is in minutes.",
        inputSchema: z.object({
            title: z.string().min(1).max(500).describe("Task title."),
            content: z.string().max(5000).optional().describe("Optional note body."),
            isAllDay: z.boolean().default(true).describe("All-day vs. time-blocked."),
            dueDate: z.string().optional().describe("Deadline. For all-day tasks use YYYY-MM-DD."),
            scheduledStart: z.string().optional().describe("Block start. Use an ISO datetime with Z or +/-HH:MM offset."),
            scheduledEnd: z.string().optional().describe("Block end. Use an ISO datetime with Z or +/-HH:MM offset."),
            durationEstimate: z.number().int().min(1).max(1440).optional().describe("Minutes."),
            projectId: z.string().uuid().optional().describe("Target project (re-validated on confirm)."),
            tagIds: z.array(z.string().uuid()).max(20).optional().describe("Tags (re-validated on confirm)."),
            priority: z.number().int().min(0).max(3).optional().describe("0=none..3=high."),
        }),
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_update_task: tool({
        description:
            "PROPOSAL ONLY — does NOT modify anything. Validates a field change/reschedule on " +
            "an existing task (by id) and returns it for confirmation. Applied later via REST. " +
            "Use YYYY-MM-DD for all-day dueDate values; use ISO datetimes with Z or +/-HH:MM offsets for time blocks. " +
            "Duration is in minutes.",
        inputSchema: z.object({
            taskId: z.string().uuid().describe("Task to change."),
            title: z.string().min(1).max(500).optional(),
            content: z.string().max(5000).optional(),
            state: z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"]).optional(),
            dueDate: z.string().nullable().optional().describe("YYYY-MM-DD for all-day deadlines, or null to clear."),
            scheduledStart: z.string().nullable().optional().describe("ISO datetime with Z or +/-HH:MM offset, or null to clear."),
            scheduledEnd: z.string().nullable().optional().describe("ISO datetime with Z or +/-HH:MM offset, or null to clear."),
            durationEstimate: z.number().int().min(1).max(1440).nullable().optional(),
            projectId: z.string().uuid().nullable().optional(),
            priority: z.number().int().min(0).max(3).optional(),
            waitingOn: z.string().max(500).nullable().optional().describe("Who/what it's blocked on."),
        }),
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_batch_reschedule: tool({
        description:
            "PROPOSAL ONLY — does NOT move anything. Builds a structured change-set plan that " +
            "moves N tasks to a target date (e.g. 'push overdue tasks to Monday'). Returns the " +
            "plan for confirmation; the moves happen later via REST. Use YYYY-MM-DD for all-day targets; " +
            "use an ISO datetime with Z or +/-HH:MM offset for timed targets.",
        inputSchema: z.object({
            taskIds: z.array(z.string().uuid()).min(1).max(50).describe("Tasks to reschedule."),
            targetDate: z.string().describe("New due/scheduled date for all of them, ISO-8601."),
            field: z
                .enum(["dueDate", "scheduledStart"])
                .default("dueDate")
                .describe("Which date field to set."),
        }),
    }),

    // ── P (destructive — danger card) ────────────────────────────────────────
    propose_delete_task: tool({
        description:
            "PROPOSAL ONLY — does NOT delete anything. DESTRUCTIVE: returns a danger-card " +
            "proposal to permanently delete a task; the delete happens later via REST after " +
            "explicit confirmation. Always echo the title so the user can verify.",
        inputSchema: z.object({
            taskId: z.string().uuid().describe("Task to delete."),
            title: z.string().describe("Title of the task being deleted, for confirmation."),
        }),
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_complete_tasks: tool({
        description:
            "PROPOSAL ONLY — does NOT complete anything. Returns a mark-done proposal for one or " +
            "more tasks; completion is applied later via REST after confirmation.",
        inputSchema: z.object({
            taskIds: z.array(z.string().uuid()).min(1).max(50).describe("Task(s) to mark COMPLETE."),
        }),
    }),
});
