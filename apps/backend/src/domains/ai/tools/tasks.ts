import { tool } from "ai";
import { z } from "zod";
import { and, eq, desc, exists, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { tasks, subtasks, taskNotes, taskTags, tags } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import { normalizeTaskFilters } from "../../tasks/task-filters";
import { buildTaskWhereClause } from "../../tasks/tasks.route";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit, MAX_LIST_LIMIT } from "./index";
import {
    toMinimalTask,
    toMinimalSubtask,
    toMinimalTag,
    resolveDueWindow,
    taskLocalDay,
} from "./projections";
import { addDaysToDateStr } from "../../../platform/date-utils";
import { fenceData, makeFenceNonce, sanitizeUntrusted } from "../safety/injection-policy";
import { NOTE_READ_LIMIT, taskDraftSchema, taskPatchSchema } from "./drafts";

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
    effort: tasks.effort,
    projectId: tasks.projectId,
    waitingOn: tasks.waitingOn,
    interactionMode: tasks.interactionMode,
    recurrenceRule: tasks.recurrenceRule,
} as const;

export const taskTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_tasks: tool({
        description:
            "The user's tasks, open ones (Active and Waiting) unless a state is given. Filters combine. " +
            "Leaves out Fixed blocks (see get_schedule_window). Returns minimal rows; more:true when the cap cut it off.",
        inputSchema: z.object({
            query: z.string().min(1).max(200).optional().describe("Words to find in titles and notes."),
            state: z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"]).optional().describe("ARCHIVED = Trash."),
            dueWindow: z
                .enum(["overdue", "today", "this_week", "this_month"])
                .optional()
                .describe("Local-date window; overdue = dated before today (repeating series excluded)."),
            projectId: z.uuid().optional().describe("One list only."),
            missingStructure: z.boolean().optional().describe("Only tasks with no date and no list."),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async (args) =>
            safeExecute("get_tasks", userId, async () => {
                const limit = clampLimit(args.limit);
                const weekStartsOn = ctx.weekStart === "Monday" ? "Monday" : "Sunday";

                // Reuse the REST filter builder — no copy-pasted WHERE clauses (AGENTS §18).
                const filterInput: Record<string, unknown> = {
                    state: args.state,
                    projectId: args.projectId,
                    hasNoDate: args.missingStructure || undefined,
                    hasNoProject: args.missingStructure || undefined,
                };
                // The window is in the user's local dates. The DB filters by UTC day, and a
                // timed task's local day can differ by one, so query a day wider on each
                // side and keep exactly the tasks whose local day falls inside.
                const window = args.dueWindow ? resolveDueWindow(args.dueWindow, ctx.today, weekStartsOn) : null;
                if (window?.from) {
                    filterInput.scheduledRangeStart = addDaysToDateStr(window.from, -1);
                    filterInput.scheduledRangeEnd = addDaysToDateStr(window.to, 1);
                } else if (window) {
                    filterInput.effectiveOnOrBeforeDate = window.to;
                }
                const normalized = normalizeTaskFilters(filterInput as never);
                // Fixed blocks (classes, shifts) aren't to-dos: they pass on their own and can't be
                // checked off, so they never belong in a task list. get_schedule_window shows them.
                const conditions = [...buildTaskWhereClause(userId, normalized), ne(tasks.interactionMode, "timetable")];
                // Done and Trash only when asked for by name.
                if (!args.state) conditions.push(inArray(tasks.state, ["ACTIVE", "WAITING"]));
                // A series is stored at its first date; that date passing doesn't make it overdue.
                if (args.dueWindow === "overdue") conditions.push(isNull(tasks.recurrenceRule));

                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) => {
                    if (args.query) {
                        // Escape LIKE wildcards so a model-supplied "%"/"_" matches literally.
                        const pattern = `%${args.query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
                        const inNote = tx
                            .select({ id: taskNotes.id })
                            .from(taskNotes)
                            .where(and(eq(taskNotes.taskId, tasks.id), ilike(taskNotes.body, pattern)));
                        conditions.push(or(ilike(tasks.title, pattern), ilike(tasks.content, pattern), exists(inNote)));
                    }
                    return tx
                        .select(minimalTaskColumns)
                        .from(tasks)
                        .where(and(...conditions))
                        .orderBy(desc(tasks.priority), desc(tasks.createdAt))
                        // ponytail: edge-day rows count toward this cap before the local-day
                        // filter; a window holding more than 50 dated tasks may come back short.
                        .limit(window ? MAX_LIST_LIMIT + 1 : limit + 1);
                });
                const matched = window
                    ? rows.filter((row) => {
                          const day = taskLocalDay(row, ctx.timezone);
                          return day !== null && (!window.from || day >= window.from) && day <= window.to;
                      })
                    : rows;
                const shown = matched.slice(0, limit);
                const more = matched.length > limit || rows.length > MAX_LIST_LIMIT;
                return { tasks: shown.map((row) => toMinimalTask(row, ctx.timezone)), count: shown.length, ...(more && { more }) };
            }),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    get_task_detail: tool({
        description:
            `One task with its subtasks, tags and note. The note shows its first ${NOTE_READ_LIMIT} characters ` +
            "(truncated:true when longer) and a version to pass back when changing it.",
        inputSchema: z.object({
            taskId: z.uuid(),
        }),
        execute: async ({ taskId }) =>
            safeExecute("get_task_detail", userId, async () => {
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const [row] = await tx
                        .select({ ...minimalTaskColumns, content: tasks.content })
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

                    // The notes panel shows task_notes.body, falling back to tasks.content.
                    const [noteRow] = await tx
                        .select({ body: taskNotes.body, version: taskNotes.version })
                        .from(taskNotes)
                        .where(and(eq(taskNotes.taskId, taskId), eq(taskNotes.userId, userId)))
                        .limit(1);
                    const noteText = noteRow?.body ?? row.content ?? "";
                    const nonce = ctx.nonce ?? makeFenceNonce();
                    const shown = noteText.slice(0, NOTE_READ_LIMIT);

                    return {
                        task: toMinimalTask(row, ctx.timezone),
                        subtasks: subs.map(toMinimalSubtask),
                        tags: tagRows.map(toMinimalTag),
                        note: {
                            text: shown && fenceData({ nonce, kind: "note", trust: "untrusted", content: sanitizeUntrusted(shown, nonce) }),
                            truncated: noteText.length > NOTE_READ_LIMIT,
                            version: noteRow?.version ?? 0,
                        },
                    };
                });
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
            "Drafts a new task. Never for a task that already exists, including one created earlier in this chat " +
            "(its taskId is in that proposal's result): use propose_update_task.",
        inputSchema: taskDraftSchema,
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_update_task: tool({
        description:
            "Drafts a change to one task: only the fields that change. state ARCHIVED = Trash. " +
            "A note change needs noteVersion from get_task_detail.",
        inputSchema: taskPatchSchema,
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_add_subtask: tool({
        description: "Drafts one checklist subtask under a task.",
        inputSchema: z.object({
            taskId: z.uuid(),
            title: z.string().min(1).max(500),
        }),
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_update_subtask: tool({
        description: "Drafts renaming a subtask and/or ticking it done or undone (ids from get_task_detail).",
        inputSchema: z.object({
            taskId: z.uuid(),
            subtaskId: z.uuid(),
            title: z.string().min(1).max(500).optional(),
            isComplete: z.boolean().optional(),
        }),
    }),

    // ── P (destructive) ──────────────────────────────────────────────────────
    propose_delete_subtask: tool({
        description: "Drafts permanently deleting a subtask. Echo its title for the user to check.",
        inputSchema: z.object({
            taskId: z.uuid(),
            subtaskId: z.uuid(),
            title: z.string(),
        }),
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_batch_reschedule: tool({
        description:
            "Drafts moving tasks to another day. Each keeps its own time (all-day stays all-day); " +
            "Fixed blocks stay put unless they're the only ones listed.",
        inputSchema: z.object({
            taskIds: z.array(z.uuid()).min(1).max(50),
            targetDate: z.iso.date().describe("The new local day."),
        }),
    }),

    // ── P (destructive — danger card) ────────────────────────────────────────
    propose_delete_task: tool({
        description: "Drafts permanently deleting a task (not Trash). Echo its title for the user to check.",
        inputSchema: z.object({
            taskId: z.uuid(),
            title: z.string(),
        }),
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_complete_tasks: tool({
        description: "Drafts marking one or more tasks done.",
        inputSchema: z.object({
            taskIds: z.array(z.uuid()).min(1).max(50),
        }),
    }),
});
