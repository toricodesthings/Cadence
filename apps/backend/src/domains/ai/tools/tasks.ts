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
import { safeExecute, clampLimit, once, MAX_LIST_LIMIT } from "./index";
import {
    toMinimalTask,
    toMinimalSubtask,
    toMinimalTag,
    resolveDueWindow,
    taskLocalDay,
} from "./projections";
import { addDaysToDateStr } from "../../../platform/date-utils";
import { fenceData, makeFenceNonce, sanitizeUntrusted } from "../safety/injection-policy";
import { NOTE_READ_LIMIT, subtaskEditSchema, taskDraftSchema, taskPatchSchema } from "./drafts";
import { hasTaskTemporalMutation, inferIsAllDay } from "@cadence/domain/task-temporal";
import { AppError } from "../../../platform/errors";
import type { Tx } from "../../../types/db";
import { createTasks, deleteTasks, rescheduleTasks, setTaskState, trackTaskChanges, updateTasks } from "../../tasks/tasks.service";
import { editSubtasks } from "../../subtasks/subtasks.service";
import { writeNote } from "../../notes/notes.service";
import { batchTaskIdsSchema, waitingOnSchema } from "@cadence/contracts/task";

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
    sectionId: tasks.sectionId,
    waitingOn: tasks.waitingOn,
    interactionMode: tasks.interactionMode,
    recurrenceRule: tasks.recurrenceRule,
} as const;

export const taskTools = (env: Env, userId: string, ctx: AgentContext) => {
    const track = ctx.waitUntil ?? (() => {});
    /** One write per tool call (`once`), then its metrics after commit; a replayed call tracks nothing. */
    const write = <T>(
        name: string,
        toolCallId: string,
        fn: (tx: Tx) => Promise<{ result: T; id: string; changes?: Parameters<typeof trackTaskChanges>[3] }>,
    ) =>
        safeExecute(name, userId, async () => {
            const db = getDbClient(env);
            let changes: Parameters<typeof trackTaskChanges>[3] | undefined;
            const result = await withRls(db, userId, (tx) =>
                once(tx, userId, toolCallId, async () => {
                    const done = await fn(tx);
                    changes = done.changes;
                    return done;
                }),
            );
            if (changes) trackTaskChanges(track, db, userId, changes);
            return result;
        });
    return {
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

        // ── W ──────────────────────────────────────────────────────────────────
        // Writes execute on the server. Whether a call waits for the user's tap is the
        // agent's `toolApproval` (safety/approval.ts), never the tool's. The tool call id
        // keys each write, so a replayed call never writes twice.
        create_tasks: tool({
            description:
                "Creates 1–20 tasks, each with optional checklist steps, tags and a note. Returns each taskId and its subtaskIds. " +
                "Never for a task that already exists: use update_tasks.",
            inputSchema: z.object({ tasks: z.array(taskDraftSchema).min(1).max(20) }),
            execute: async ({ tasks: drafts }, { toolCallId }) =>
                write("create_tasks", toolCallId, async (tx) => {
                    const created = await createTasks(tx, userId, drafts.map(({ fromImage: _quotes, ...draft }) => draft));
                    return { result: { created }, id: created[0].taskId, changes: { created: created.map((task) => task.taskId) } };
                }),
        }),

        update_tasks: tool({
            description:
                "Applies the same change to 1–50 tasks: only the fields that change, plus tags to add or remove. " +
                "A title or note change is for one task. Returns how many changed.",
            inputSchema: z
                .object({ taskIds: batchTaskIdsSchema, patch: taskPatchSchema })
                .refine(
                    ({ taskIds, patch }) => taskIds.length === 1 || [patch.title, patch.note, patch.appendNote].every((v) => v === undefined),
                    "A title or note change is for one task",
                )
                .refine(({ patch }) => patch.note === undefined || patch.noteVersion !== undefined, "note needs noteVersion from get_task_detail"),
            execute: async ({ taskIds, patch }, { toolCallId }) =>
                write("update_tasks", toolCallId, async (tx) => {
                    const { addTagIds, removeTagIds, note, appendNote, noteVersion, ...fields } = patch;
                    const isAllDay = inferIsAllDay(fields);
                    const rows = await updateTasks(tx, userId, {
                        taskIds,
                        patch: { ...fields, ...(isAllDay !== undefined && { isAllDay }) },
                        addTagIds,
                        removeTagIds,
                    });
                    if (note !== undefined || appendNote) await changeNote(tx, userId, taskIds[0], { note, appendNote, noteVersion });
                    const changes = hasTaskTemporalMutation(fields) ? { rescheduled: rows } : undefined;
                    return { result: { updated: rows.length }, id: taskIds[0], changes };
                }),
        }),

        edit_subtasks: tool({
            description:
                "Adds, renames, ticks or removes a task's checklist steps in one go (subtask ids from get_task_detail). " +
                "Added steps go at the end. Returns the new subtask ids and counts.",
            inputSchema: subtaskEditSchema,
            execute: async (input, { toolCallId }) =>
                write("edit_subtasks", toolCallId, async (tx) => ({ result: await editSubtasks(tx, userId, input), id: input.taskId })),
        }),

        set_task_state: tool({
            description:
                "Moves 1–50 tasks to Done, Trash (ARCHIVED, restorable), back to open (ACTIVE), or Waiting (with waitingOn). " +
                "Returns how many changed.",
            inputSchema: z.object({
                taskIds: batchTaskIdsSchema,
                state: z.enum(["COMPLETE", "ARCHIVED", "ACTIVE", "WAITING"]),
                waitingOn: waitingOnSchema.min(1).optional().describe("Who or what, with WAITING."),
            }),
            execute: async ({ taskIds, state, waitingOn }, { toolCallId }) =>
                write("set_task_state", toolCallId, async (tx) => {
                    const rows = await setTaskState(tx, userId, taskIds, state, waitingOn);
                    const changes = state === "COMPLETE" ? { completed: rows.map((row) => row.id) } : undefined;
                    return { result: { updated: rows.length }, id: taskIds[0], changes };
                }),
        }),

        delete_tasks: tool({
            description: "Permanently deletes 1–20 tasks (not Trash; can't be undone). Echo each title. Returns how many were deleted.",
            inputSchema: z.object({
                tasks: z.array(z.object({ taskId: z.uuid(), title: z.string().max(500) })).min(1).max(20),
            }),
            execute: async ({ tasks: targets }, { toolCallId }) =>
                write("delete_tasks", toolCallId, async (tx) => {
                    const rows = await deleteTasks(tx, userId, targets.map((target) => target.taskId));
                    return { result: { deleted: rows.length }, id: targets[0].taskId };
                }),
        }),

        reschedule_tasks: tool({
            description:
                "Moves 1–50 tasks to another day. Each keeps its own time (all-day stays all-day); " +
                "Fixed blocks stay put unless they're the only ones listed. Returns how many moved.",
            inputSchema: z.object({
                taskIds: batchTaskIdsSchema,
                targetDate: z.iso.date().describe("The new local day."),
            }),
            execute: async ({ taskIds, targetDate }, { toolCallId }) =>
                write("reschedule_tasks", toolCallId, async (tx) => {
                    const rows = await rescheduleTasks(tx, userId, { taskIds, date: targetDate, timezone: ctx.timezone, isAllDay: true });
                    return { result: { moved: rows.length }, id: taskIds[0], changes: { rescheduled: rows } };
                }),
        }),
    };
};

/**
 * Rewrite or add to one task's note. The note the user sees is `task_notes.body`,
 * falling back to the legacy `tasks.content`. A rewrite is refused for a note
 * longer than the model can read; a stale `noteVersion` is a 409.
 */
async function changeNote(
    tx: Tx,
    userId: string,
    taskId: string,
    { note, appendNote, noteVersion }: { note?: string; appendNote?: string; noteVersion?: number },
) {
    const [row] = await tx
        .select({ body: taskNotes.body, version: taskNotes.version, content: tasks.content })
        .from(tasks)
        .leftJoin(taskNotes, eq(taskNotes.taskId, tasks.id))
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    const current = row?.body ?? row?.content ?? "";
    if (note !== undefined && current.length > NOTE_READ_LIMIT) {
        throw new AppError(400, "NOTE_TOO_LONG", "That note is too long to rewrite whole; add to it with appendNote");
    }
    const body = note ?? (current ? `${current.trimEnd()}\n${appendNote}` : appendNote!);
    await writeNote(tx, userId, taskId, body, { expectedVersion: noteVersion ?? row?.version ?? 0 });
}
