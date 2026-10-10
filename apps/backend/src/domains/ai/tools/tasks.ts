import { tool } from "ai";
import { z } from "zod";
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { projects, savedFocusViews, taskSections, tasks, subtasks, taskNotes, taskTags, tags } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import { hasNoDay, inDayWindow, onOrBefore } from "../../tasks/task-filters";
import { buildTaskWhereClause } from "../../tasks/tasks.read";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit, once } from "./index";
import {
    toMinimalTask,
    toMinimalSubtask,
    toMinimalTag,
    resolveDueWindow,
} from "./projections";
import { fenceData, makeFenceNonce, sanitizeUntrusted } from "../safety/injection-policy";
import { NOTE_READ_LIMIT, subtaskEditSchema, taskDraftSchema, taskPatchSchema } from "./drafts";
import { taskDay } from "@cadence/domain/task-recurrence";
import { hasTaskTemporalMutation } from "@cadence/domain/task-temporal";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { AppError, throwIfNotFound } from "../../../platform/errors";
import { approvalFor } from "../safety/approval";
import type { Tx } from "../../../types/db";
import {
    createTasks,
    deleteTasks,
    duplicateTask,
    reorderTasks,
    rescheduleTasks,
    setTaskState,
    trackTaskChanges,
    updateTasks,
} from "../../tasks/tasks.service";
import { findOrCreateTags } from "../../tags/tags.service";
import { processCapture } from "../../inbox/inbox.service";
import { editSubtasks } from "../../subtasks/subtasks.service";
import { writeNote } from "../../notes/notes.service";
import { batchTaskIdsSchema, waitingOnSchema } from "@cadence/contracts/task";
import { readFocusView } from "./focus-views";

/**
 * The task's list and section names, so the model can match how the user remembers it
 * ("the COMP3005 assignment") and say where it lives, with no extra read.
 */
export const placeNameColumns = {
    listName: sql<string | null>`(select ${projects.name} from ${projects} where ${projects.id} = ${tasks.projectId})`,
    sectionName: sql<string | null>`(select ${taskSections.name} from ${taskSections} where ${taskSections.id} = ${tasks.sectionId})`,
};

/** Columns returned by the minimal task projection — selected once, reused. */
const minimalTaskColumns = {
    ...placeNameColumns,
    id: tasks.id,
    title: tasks.title,
    state: tasks.state,
    dueDate: tasks.dueDate,
    endDate: tasks.endDate,
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
    isPinned: tasks.isPinned,
    reminderAt: tasks.reminderAt,
    waitingReminder: tasks.waitingReminder,
    notBefore: tasks.notBefore,
} as const;

const offsetSchema = z.number().int().min(0).max(100_000).optional().describe("From nextOffset; omit for the first page.");

/** A task's day in SQL, for ordering: a timed task's start in the user's zone, else its due day. */
const daySql = (zone: string) =>
    sql`(CASE WHEN ${tasks.scheduledStart} IS NOT NULL THEN (${tasks.scheduledStart} AT TIME ZONE ${zone})::date ELSE ${tasks.dueDate} END)`;

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
    const zone = ctx.timezone;
    const day = daySql(zone);
    const weekStartsOn = ctx.weekStart === "Monday" ? "Monday" : "Sunday";
    /** Tasks on a day from `from` to `to` (open start: everything up to `to`). A series sits in get_schedule_window, not here. */
    const dayRange = (from: LocalDate | undefined, to: LocalDate) =>
        and(isNull(tasks.recurrenceRule), from ? inDayWindow(from, to, zone) : onOrBefore(to, zone));

    return {
        // ── R ──────────────────────────────────────────────────────────────────
        get_tasks: tool({
            description:
                "The user's tasks, open ones (Active and Waiting) unless a state is given. Filters combine. " +
                "Leaves out Fixed blocks and the days of repeating series (see get_schedule_window). Rows carry their tag names. Pages with offset: more:true and nextOffset when there's more.",
            inputSchema: z.object({
                query: z.string().min(1).max(200).optional().describe("Words to find; each must be in the title, note, list name or section name."),
                state: z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"]).optional().describe("ARCHIVED = Trash."),
                dueWindow: z
                    .enum(["overdue", "today", "this_week", "this_month"])
                    .optional()
                    .describe("Local-day window; overdue = dated before today."),
                from: z.iso.date().optional().describe("Dated on or after this local day."),
                to: z.iso.date().optional().describe("Dated on or before this local day."),
                noDate: z.boolean().optional().describe("Only tasks with no date."),
                projectId: z.uuid().optional().describe("One list only."),
                sectionId: z.uuid().optional().describe("One section (with projectId)."),
                noSection: z.boolean().optional().describe("Only tasks in no section (with projectId)."),
                tagId: z.uuid().optional().describe("Only tasks with this tag."),
                minPriority: z.number().int().min(1).max(4).optional().describe("At least this priority (3 = high and urgent)."),
                pinned: z.boolean().optional().describe("Only pinned tasks."),
                missingStructure: z.boolean().optional().describe("Only tasks with no date and no list."),
                focusViewId: z.uuid().optional().describe("Apply a saved focus view's filters (get_focus_views)."),
                sort: z
                    .enum(["priority", "list", "date"])
                    .optional()
                    .describe("priority (default) · list = the list's own order (pinned first) · date = soonest first, undated last."),
                offset: offsetSchema,
                limit: z.number().int().min(1).max(50).default(20),
            }).refine((v) => (v.sectionId === undefined && !v.noSection) || v.projectId, "sectionId and noSection need projectId"),
            execute: async (args) =>
                safeExecute("get_tasks", userId, async () => {
                    const limit = clampLimit(args.limit);
                    const offset = args.offset ?? 0;
                    const db = getDbClient(env);
                    return withRls(db, userId, async (tx) => {
                        // Reuse the REST filter builder — no copy-pasted WHERE clauses (AGENTS §18).
                        // Fixed blocks (classes, shifts) aren't to-dos: they pass on their own and can't be
                        // checked off, so they never belong in a task list. get_schedule_window shows them.
                        const conditions: (SQL | undefined)[] = [
                            ...buildTaskWhereClause(userId, {
                                state: args.state,
                                projectId: args.projectId,
                                // false is "any", like noDate: a model filling every field must not hide pinned tasks.
                                isPinned: args.pinned || undefined,
                                hasNoDate: args.missingStructure || args.noDate || undefined,
                                hasNoProject: args.missingStructure || undefined,
                            }, zone),
                            ne(tasks.interactionMode, "timetable"),
                        ];
                        let sort = args.sort;
                        let view: { name: string } | undefined;
                        if (args.focusViewId) {
                            const applied = await focusViewConditions(tx, args.focusViewId);
                            conditions.push(...applied.conditions);
                            view = { name: applied.name };
                            sort ??= applied.sort;
                            // A view's states replace the open-only default.
                            if (!args.state && !applied.hasStates) conditions.push(inArray(tasks.state, ["ACTIVE", "WAITING"]));
                        } else if (!args.state) {
                            // Done and Trash only when asked for by name.
                            conditions.push(inArray(tasks.state, ["ACTIVE", "WAITING"]));
                        }
                        if (args.dueWindow) {
                            const window = resolveDueWindow(args.dueWindow, ctx.today, weekStartsOn);
                            conditions.push(dayRange(window.from, window.to));
                        }
                        if (args.from || args.to) {
                            // One side open is a half-bounded range.
                            conditions.push(dayRange(args.from, args.to ?? "2999-12-31"));
                        }
                        if (args.sectionId) conditions.push(eq(tasks.sectionId, args.sectionId));
                        else if (args.noSection) conditions.push(isNull(tasks.sectionId));
                        if (args.tagId) conditions.push(hasAnyTag([args.tagId]));
                        if (args.minPriority) conditions.push(gte(tasks.priority, args.minPriority));
                        // Each word on its own, anywhere the user would recall it: "comp assignment" finds
                        // "Assignment 1" in the COMP3005 section.
                        for (const word of args.query?.split(/\s+/).filter(Boolean).slice(0, 8) ?? []) {
                            // Escape LIKE wildcards so a model-supplied "%"/"_" matches literally.
                            const pattern = `%${word.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
                            const inNote = tx
                                .select({ id: taskNotes.id })
                                .from(taskNotes)
                                .where(and(eq(taskNotes.taskId, tasks.id), ilike(taskNotes.body, pattern)));
                            conditions.push(or(
                                ilike(tasks.title, pattern), ilike(tasks.content, pattern), exists(inNote),
                                sql`${placeNameColumns.listName} ilike ${pattern}`, sql`${placeNameColumns.sectionName} ilike ${pattern}`,
                            ));
                        }

                        const order = {
                            priority: [desc(tasks.priority), desc(tasks.createdAt)],
                            list: [desc(tasks.isPinned), asc(tasks.orderIndex)],
                            date: [sql`${day} asc nulls last`, sql`${tasks.scheduledStart} asc nulls first`],
                        }[sort ?? "priority"];
                        const rows = await tx
                            .select(minimalTaskColumns)
                            .from(tasks)
                            .where(and(...conditions))
                            .orderBy(...order, asc(tasks.id))
                            .limit(limit + 1)
                            .offset(offset);
                        const shown = rows.slice(0, limit);
                        const tagNames = await tagNamesFor(tx, shown.map((row) => row.id));
                        const more = rows.length > limit;
                        return {
                            ...(view && { view }),
                            tasks: shown.map((row) => toMinimalTask({ ...row, tagNames: tagNames.get(row.id) }, ctx.timezone)),
                            count: shown.length,
                            ...(more && { more, nextOffset: offset + limit }),
                        };
                    });
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
                                text: shown && (ctx.rawNotes ? shown : fenceData({ nonce, kind: "note", trust: "untrusted", content: sanitizeUntrusted(shown, nonce) })),
                                ...(ctx.rawNotes && { source: "user-content" as const }),
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
                "Creates 1–20 tasks, each with optional checklist steps, tags (by id or name), a note, a reminder and a hide-until day. " +
                "With inboxItemId the task is made from that capture, which leaves Capture (no date given = no date). " +
                "Returns each taskId and its subtaskIds. Never for a task that already exists: use update_tasks.",
            inputSchema: z.object({
                tasks: z.array(taskDraftSchema.extend({
                    inboxItemId: z.uuid().optional().describe("The capture this task is made from. A reminder and a hide-until day carry over; a capture can't become a Fixed block."),
                }).refine(
                    // null and false set nothing: a model that sends every field sends them for "none".
                    (d) => !d.inboxItemId || !d.fixed,
                    "A task from a capture can't be a Fixed block",
                )).min(1).max(20),
            }),
            execute: async ({ tasks: drafts }, { toolCallId }) =>
                write("create_tasks", toolCallId, async (tx) => {
                    // One lookup for every draft's tag names, so two drafts never make the same tag twice.
                    const named = await tagIdsByName(tx, drafts.flatMap((draft) => draft.tagNames ?? []));
                    const created: { taskId: string; title: string; subtaskIds?: string[]; inboxItemId?: string }[] = [];
                    for (const { fromImage: _quotes, tagNames = [], hideUntil, tagIds = [], inboxItemId, ...draft } of drafts) {
                        const allTagIds = [...tagIds, ...tagNames.map((name) => named.get(name.trim().toLowerCase())!)];
                        if (!inboxItemId) {
                            created.push(...await createTasks(tx, userId, [{ ...draft, tagIds: allTagIds, notBefore: hideUntil }]));
                            continue;
                        }
                        const { subtasks: steps, note, fixed: _fixed, ...fields } = draft;
                        const { task } = await processCapture(tx, userId, inboxItemId, {
                            ...fields,
                            // Explicit nulls: the capture's own words never add a date, list or tags.
                            dueDate: fields.dueDate ?? null,
                            scheduledStart: fields.scheduledStart ?? null,
                            scheduledEnd: fields.scheduledEnd ?? null,
                            projectId: fields.projectId ?? null,
                            sectionId: fields.sectionId ?? null,
                            reminderAt: fields.reminderAt ?? null,
                            notBefore: hideUntil ?? null,
                            tagIds: allTagIds,
                        }, { subtasks: steps, note });
                        created.push({ inboxItemId, taskId: task.id, title: task.title });
                    }
                    return { result: { created }, id: created[0].taskId, changes: { created: created.map((task) => task.taskId) } };
                }),
        }),

        duplicate_tasks: tool({
            description:
                "Copies 1–20 tasks as new open ones (fields, list, tags and note; not checklist steps or reminders), " +
                "optionally renamed or moved to another day (keeping the time). Returns each new taskId.",
            inputSchema: z.object({
                tasks: z.array(z.object({
                    taskId: z.uuid(),
                    title: z.string().min(1).max(500).optional().describe("The copy's title; default adds \"(copy)\"."),
                    targetDate: z.iso.date().optional().describe("The copy's local day."),
                })).min(1).max(20),
            }),
            execute: async ({ tasks: sources }, { toolCallId }) =>
                write("duplicate_tasks", toolCallId, async (tx) => {
                    const created: { taskId: string; title: string; from: string }[] = [];
                    for (const { taskId, title, targetDate } of sources) {
                        const copy = await duplicateTask(tx, userId, taskId, title);
                        if (targetDate) {
                            await rescheduleTasks(tx, userId, { taskIds: [copy.id], date: targetDate });
                        }
                        created.push({ taskId: copy.id, title: copy.title, from: taskId });
                    }
                    return { result: { created }, id: created[0].taskId, changes: { created: created.map((task) => task.taskId) } };
                }),
        }),

        update_tasks: tool({
            description:
                "Applies the same change to 1–50 tasks: only the fields that change, plus tags to add (by id or name) or remove. " +
                "Also sets or clears a reminder, a Waiting check-in, a hide-until day, pinning and Fixed. " +
                "A title or note change is for one task. Returns how many changed.",
            inputSchema: z
                .object({ taskIds: batchTaskIdsSchema, patch: taskPatchSchema })
                .refine(
                    ({ taskIds, patch }) => taskIds.length === 1 || [patch.title, patch.note, patch.appendNote].every((v) => v === undefined),
                    "A title or note change is for one task",
                )
                .refine(({ patch }) => patch.note === undefined || patch.noteVersion !== undefined, "note needs noteVersion from get_task_detail")
                .refine(({ patch }) => Object.values(patch).some((v) => v !== undefined),
                    "Nothing to change: set a field, or name it in clear to empty it (null changes nothing)"),
            execute: async ({ taskIds, patch }, { toolCallId }) =>
                write("update_tasks", toolCallId, async (tx) => {
                    const { addTagIds = [], addTagNames, removeTagIds = [], removeTagNames, note, appendNote, noteVersion, checkInAt, hideUntil, fixed, ...fields } = patch;
                    const rows = await updateTasks(tx, userId, {
                        taskIds,
                        patch: {
                            ...fields,
                            ...(checkInAt !== undefined && { waitingReminder: checkInAt }),
                            ...(hideUntil !== undefined && { notBefore: hideUntil }),
                            ...(fixed !== undefined && { interactionMode: fixed ? "timetable" as const : "task" as const }),
                        },
                        addTagIds: [...addTagIds, ...(addTagNames?.length ? await findOrCreateTags(tx, userId, addTagNames) : [])],
                        removeTagIds: [...removeTagIds, ...(removeTagNames?.length ? await existingTagIds(tx, removeTagNames) : [])],
                    });
                    if (note !== undefined || appendNote) await changeNote(tx, userId, taskIds[0], { note, appendNote, noteVersion });
                    const changes = hasTaskTemporalMutation(fields) ? { rescheduled: rows } : undefined;
                    return { result: { updated: rows.length }, id: taskIds[0], changes };
                }),
        }),

        reorder_tasks: tool({
            description:
                "Places 1–50 tasks one after another, in the order given, in their list's own order: at the top or bottom, " +
                "or right before or after another open task in that list. Other tasks keep their places.",
            inputSchema: z
                .object({
                    taskIds: batchTaskIdsSchema.describe("In the order they should end up."),
                    to: z.enum(["top", "bottom"]).optional(),
                    beforeTaskId: z.uuid().optional(),
                    afterTaskId: z.uuid().optional(),
                })
                .refine((v) => [v.to, v.beforeTaskId, v.afterTaskId].filter(Boolean).length === 1, "Send one of to, beforeTaskId or afterTaskId"),
            execute: async ({ taskIds, to, beforeTaskId, afterTaskId }, { toolCallId }) =>
                write("reorder_tasks", toolCallId, async (tx) => ({
                    result: await reorderTasks(tx, userId, taskIds, to ? { to } : beforeTaskId ? { beforeTaskId } : { afterTaskId: afterTaskId! }),
                    id: taskIds[0],
                })),
        }),

        edit_subtasks: tool({
            description:
                "Adds, renames, ticks, removes or reorders a task's checklist steps in one go (subtask ids from get_task_detail). " +
                "Added steps go at the end. Returns the new subtask ids and counts.",
            inputSchema: subtaskEditSchema,
            execute: async (input, { toolCallId }) =>
                write("edit_subtasks", toolCallId, async (tx) => ({ result: await editSubtasks(tx, userId, input), id: input.taskId })),
        }),

        set_task_state: tool({
            description:
                "Moves 1–50 tasks to Done, Trash (ARCHIVED, restorable), back to open (ACTIVE), or Waiting (with waitingOn and an optional check-in). " +
                "Returns each task with the state it was in. Done or Trash holds when another open task has the same title and day: it lists them to ask about.",
            inputSchema: z.object({
                taskIds: batchTaskIdsSchema,
                state: z.enum(["COMPLETE", "ARCHIVED", "ACTIVE", "WAITING"]),
                waitingOn: waitingOnSchema.min(1).optional().describe("Who or what, with WAITING."),
                checkInAt: taskPatchSchema.shape.checkInAt.unwrap().unwrap().optional().describe("With WAITING: when to check again, local time with offset."),
                sameTitleOk: z.boolean().optional().describe("The user said which of the same-titled tasks they mean."),
            }),
            execute: async (input, { toolCallId }) =>
                write<{ updated: number; tasks?: object[]; sameTitle?: object[]; note?: string }>("set_task_state", toolCallId, async (tx) => {
                    const { taskIds, state, waitingOn, checkInAt, sameTitleOk } = input;
                    const before = await tasksBefore(tx, taskIds);
                    // A tapped card is the user's own pick; otherwise a same-titled twin means the model may have guessed.
                    const tapped = !ctx.approvalMode || approvalFor(ctx.approvalMode)({ toolCall: { toolName: "set_task_state", input } }) !== undefined;
                    const twins = (state === "COMPLETE" || state === "ARCHIVED") && !tapped && !sameTitleOk ? await sameTitled(tx, before) : [];
                    if (twins.length) {
                        return {
                            result: {
                                updated: 0,
                                sameTitle: twins,
                                note: "Nothing changed: more than one open task has this title and day. If the user didn't say which, ask, naming each by its list or section. If they did, call again with sameTitleOk: true.",
                            },
                            id: taskIds[0],
                        };
                    }
                    const rows = await setTaskState(tx, userId, taskIds, state, waitingOn, checkInAt);
                    const changes = state === "COMPLETE" ? { completed: rows.map((row) => row.id) } : undefined;
                    return { result: { updated: rows.length, tasks: before.map(({ id, title, state: was }) => ({ id, title, was })) }, id: taskIds[0], changes };
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
                "Fixed blocks stay put unless they're the only ones listed. Returns each task moved with the day it left (from; null = it had none).",
            inputSchema: z.object({
                taskIds: batchTaskIdsSchema,
                targetDate: z.iso.date().describe("The new local day."),
            }),
            execute: async ({ taskIds, targetDate }, { toolCallId }) =>
                write("reschedule_tasks", toolCallId, async (tx) => {
                    const before = await tasksBefore(tx, taskIds);
                    const rows = await rescheduleTasks(tx, userId, { taskIds, date: targetDate });
                    const moved = new Set(rows.map((row) => row.id));
                    // The day each left, so "undo that" can put each one back where it was.
                    const left = before.filter((row) => moved.has(row.id)).map(({ id, title, day }) => ({ id, title, from: day }));
                    return { result: { moved: rows.length, tasks: left }, id: taskIds[0], changes: { rescheduled: rows } };
                }),
        }),
    };

    /**
     * The tasks a batch write names, as they are before it. An id that matches no task
     * fails the call, so a remembered or made-up id gets a fresh read instead of a silent 0.
     */
    async function tasksBefore(tx: Tx, taskIds: string[]) {
        const rows = await tx
            .select({ id: tasks.id, title: tasks.title, state: tasks.state, dueDate: tasks.dueDate, scheduledStart: tasks.scheduledStart })
            .from(tasks)
            .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)));
        const missing = new Set(taskIds).size - rows.length;
        if (missing) throw new AppError(404, "NOT_FOUND", `${missing} of these taskIds match no task. Read the tasks again (get_tasks or get_schedule_window) and retry with the ids it returns`);
        return rows.map(({ dueDate, scheduledStart, ...row }) => ({ ...row, day: taskDay({ dueDate, scheduledStart }, zone) }));
    }

    /**
     * Open tasks that share a title (any case) and a day (or both no day) with one of `targets`,
     * when two or more do: nothing in the data tells them apart, so a pick among them is a guess.
     * A different day can (the nearer one is a fair pick), so it doesn't count.
     */
    async function sameTitled(tx: Tx, targets: { title: string; day: string | null }[]) {
        const titles = [...new Set(targets.map((row) => row.title.toLowerCase()))];
        const rows = await tx
            .select({ id: tasks.id, title: tasks.title, ...placeNameColumns, dueDate: tasks.dueDate, scheduledStart: tasks.scheduledStart })
            .from(tasks)
            .where(and(
                eq(tasks.userId, userId),
                inArray(tasks.state, ["ACTIVE", "WAITING"]),
                ne(tasks.interactionMode, "timetable"),
                inArray(sql`lower(${tasks.title})`, titles),
            ))
            .limit(20);
        const withDay = rows.map(({ dueDate, scheduledStart, ...row }) => ({ ...row, day: taskDay({ dueDate, scheduledStart }, zone) }));
        const key = (row: { title: string; day: string | null }) => `${row.title.toLowerCase()}|${row.day ?? ""}`;
        const wanted = new Set(targets.map(key));
        const count = new Map<string, number>();
        for (const row of withDay) count.set(key(row), (count.get(key(row)) ?? 0) + 1);
        return withDay
            .filter((row) => wanted.has(key(row)) && count.get(key(row))! > 1)
            .map(({ id, title, listName, sectionName, day }) => ({ id, title, list: listName ?? undefined, section: sectionName ?? undefined, day: day ?? undefined }));
    }

    /** Tag ids keyed by lower-cased name, found or made in one pass. */
    async function tagIdsByName(tx: Tx, names: string[]) {
        const clean = names.map((name) => name.trim()).filter(Boolean);
        const ids = await findOrCreateTags(tx, userId, clean);
        return new Map(clean.map((name, i) => [name.toLowerCase(), ids[i]]));
    }

    /** The ids of the user's tags with these names (case-insensitive); a name with no tag is skipped. */
    async function existingTagIds(tx: Tx, names: string[]) {
        const wanted = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))];
        if (!wanted.length) return [];
        const rows = await tx.select({ id: tags.id }).from(tags)
            .where(and(eq(tags.userId, userId), inArray(sql`lower(${tags.name})`, wanted)));
        return rows.map((row) => row.id);
    }

    /** Tasks carrying any of `tagIds`. */
    function hasAnyTag(tagIds: string[]) {
        return exists(
            sql`(select 1 from ${taskTags} where ${taskTags.taskId} = ${tasks.id} and ${inArray(taskTags.tagId, tagIds)})`,
        );
    }

    /**
     * A saved focus view as SQL, with the same meaning as the app's `applyFocusView`:
     * its due windows are "by then" (undated tasks stay in, except for overdue).
     */
    async function focusViewConditions(tx: Tx, id: string) {
        const [row] = await tx
            .select({ name: savedFocusViews.name, definition: savedFocusViews.definition })
            .from(savedFocusViews)
            .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)));
        throwIfNotFound(row, "Focus view");
        const view = readFocusView(row.definition);
        if (!view) throw new AppError(400, "VALIDATION_ERROR", "That focus view can't be read");
        const conditions: (SQL | undefined)[] = [];
        if (view.states.length) conditions.push(inArray(tasks.state, view.states));
        if (view.projectIds.length) conditions.push(inArray(tasks.projectId, view.projectIds));
        if (view.tagIds.length) conditions.push(hasAnyTag(view.tagIds));
        if (view.needsDate) conditions.push(hasNoDay());
        if (view.needsProject) conditions.push(isNull(tasks.projectId));
        if (view.priorityMin !== null) conditions.push(gte(tasks.priority, view.priorityMin));
        if (view.effortMin !== null) conditions.push(or(isNull(tasks.effort), gte(tasks.effort, view.effortMin)));
        if (view.effortMax !== null) conditions.push(or(isNull(tasks.effort), lte(tasks.effort, view.effortMax)));
        // Short = a known estimate at most this long; unknown length is not known-short.
        if (view.durationMaxMinutes !== null) conditions.push(lte(tasks.durationEstimate, view.durationMaxMinutes));
        if (view.waitingOnly) conditions.push(isNotNull(tasks.waitingOn));
        if (view.missingStructureOnly) conditions.push(or(hasNoDay(), isNull(tasks.projectId)));
        if (view.dueWindow === "overdue") conditions.push(onOrBefore(addDays(ctx.today, -1), zone));
        else if (view.dueWindow) conditions.push(or(hasNoDay(), onOrBefore(resolveDueWindow(view.dueWindow, ctx.today, weekStartsOn).to, zone)));
        const sort = ({ smart: "date", priority: "priority", manual: "list" } as const)[view.sortMode];
        return { name: row.name, conditions, sort, hasStates: view.states.length > 0 };
    }
};

/** Each task's tag names (by name: what the user says, and far shorter than ids), in one query. */
export async function tagNamesFor(tx: Tx, taskIds: string[]) {
    const byTask = new Map<string, string[]>();
    if (!taskIds.length) return byTask;
    const links = await tx
        .select({ taskId: taskTags.taskId, name: tags.name })
        .from(taskTags)
        .innerJoin(tags, eq(taskTags.tagId, tags.id))
        .where(inArray(taskTags.taskId, taskIds))
        .orderBy(asc(tags.name));
    for (const link of links) byTask.set(link.taskId, [...(byTask.get(link.taskId) ?? []), link.name]);
    return byTask;
}

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
