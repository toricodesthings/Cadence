import { useState, useMemo, useCallback } from "react";
import { useInbox } from "../inbox/use-inbox";
import { useDeleteInboxItem } from "../inbox/use-delete-inbox-item";
import { useUpdateInboxItem } from "../inbox/use-update-inbox-item";
import { useProcessInboxToTask } from "../inbox/use-process-inbox-to-task";
import { useProjects } from "../projects/use-projects";
import { useTags } from "../tags/use-tags";
import { useSettings } from "./use-settings";
import { computeNlp, loadParse } from "../use-nlp-parse";
import { resolvedNlp } from "../../lib/utils/task/resolved-nlp";
import { useApplyInstruction } from "../tasks/use-apply-instruction";
import { toDay } from "../../lib/utils/date-format";
import type { InstructionPatch } from "@cadence/domain/task-instruction";
import type { InboxItem } from "@cadence/contracts/inbox";
import { useTasks } from "../tasks/use-tasks";
import { useUpdateTask } from "../tasks/use-update-task";
import { useArchiveTask } from "../tasks/use-archive-task";
import { useHabitsRange } from "../habits/use-habits";
import { usePauseHabit } from "../habits/use-pause-habit";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { today, useToday } from "../../lib/utils/user-zone";
import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";

export interface HabitReviewItem {
    id: string;
    /** The routine itself, for its day cells (logging a past day in place). */
    habit: Habit;
    title: string;
    colorAccent: string | null;
    /** The last 7 days (oldest first): a scheduled day's status, or null when it wasn't due. */
    week: { day: LocalDate; status: "COMPLETED" | "SKIPPED" | "PENDING" | null }[];
    /** Skipped on every day it was due so far this week: "Skip next week?" shows. */
    allSkipped: boolean;
}

const getToday = today;
const getTomorrow = () => addDays(today(), 1);
/** The routine look-back: the last 7 days, today included. */
const WEEK_DAYS = 7;


/** The person's choices for a placed capture: the day or patch wins over its words, and its own date words never decide placement. */
function manualFromPatch(patch: InstructionPatch, day: LocalDate | undefined) {
    return {
        dueDate: patch.dueDate !== undefined ? patch.dueDate : (day ?? null),
        // The placement is the user's call here; the capture's own date words never decide it.
        scheduledStart: patch.scheduledStart ?? null,
        scheduledEnd: patch.scheduledEnd ?? null,
        ...(patch.projectId && { projectId: patch.projectId }),
        ...(patch.addTagIds && { tagIds: patch.addTagIds }),
        ...(patch.priority && { priority: patch.priority }),
        ...(patch.waitingOn && { waitingOn: patch.waitingOn }),
        ...(patch.durationEstimate && { durationMinutes: patch.durationEstimate }),
    };
}

/** What is left after placing (waiting, hiding, a nudge): a plain edit of the new task. */
function followUpEdits(patch: InstructionPatch, waitlist: boolean | undefined) {
    const { state, notBefore, waitingReminder } = patch;
    return { ...(waitlist ? { state: "WAITING" as const } : state ? { state } : {}), ...(notBefore ? { notBefore } : {}), ...(waitingReminder ? { waitingReminder } : {}) };
}
export function useWeeklyReviewActions() {
    const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [keptWaitingIds, setKeptWaitingIds] = useState<Set<string>>(new Set());

    const { data: inboxItems = [] } = useInbox();
    const { data: activeTasks = [] } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks = [] } = useTasks({ state: "WAITING" });

    const updateTask = useUpdateTask();
    const archiveTask = useArchiveTask();
    const deleteInboxItem = useDeleteInboxItem();
    const updateInboxItem = useUpdateInboxItem();
    const processCapture = useProcessInboxToTask();
    const { apply: applyInstruction } = useApplyInstruction();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: settings } = useSettings();

    const todayDay = useToday();
    // Hidden tasks (Hide until a later day) aren't loose ends until they come back.
    const unscheduledTasks = useMemo(
        () => activeTasks.filter((t) => !t.dueDate && !t.scheduledStart && (!t.notBefore || t.notBefore <= todayDay)),
        [activeTasks, todayDay],
    );

    const visibleWaiting = waitingTasks.filter((t) => !keptWaitingIds.has(t.id));

    // Every step reads the routines (Welcome and the step list count them), so the query is never gated by step.
    const weekStart = addDays(todayDay, -(WEEK_DAYS - 1));
    const { data: habits = [] } = useHabitsRange({ start: weekStart, end: todayDay });

    const habitReviewItems = useMemo<HabitReviewItem[]>(() => {
        // Your own routine order, so a row never jumps while you log its days (a save can reshuffle the cache).
        return habits
            .filter((h) => !h.archived)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
            .map((h) => {
                const byDay = new Map((h.logs ?? []).map((l) => [l.targetDate, l.status]));
                const week = Array.from({ length: WEEK_DAYS }, (_, i) => {
                    const day = addDays(weekStart, i);
                    return { day, status: byDay.get(day) ?? null };
                });
                const due = week.filter((d) => d.status !== null && d.day <= todayDay);
                return {
                    id: h.id,
                    habit: h,
                    title: h.title,
                    colorAccent: h.colorAccent ?? null,
                    week,
                    allSkipped: due.length > 0 && due.every((d) => d.status === "SKIPPED"),
                };
            });
    }, [habits, weekStart, todayDay]);

    const pauseHabit = usePauseHabit();

    const runCardAction = useCallback(async (actionKey: string, actionFn: () => Promise<void>) => {
        if (pendingActionKey) return;
        setPendingActionKey(actionKey);
        setActionError(null);
        try {
            await actionFn();
        } catch {
            setActionError("Couldn\u2019t save that. Try again?");
        } finally {
            setPendingActionKey(null);
        }
    }, [pendingActionKey]);

    /**
     * Turn a capture into a task through the one transactional path (the capture stays, as placed, and Undo is its own).
     * A day or typed change replaces what the words said; a capture from an earlier day keeps its words literal,
     * because its "tomorrow" is not today's.
     */
    const placeCapture = useCallback(async (item: InboxItem, choice: { day?: LocalDate; patch?: InstructionPatch; waitlist?: boolean }) => {
        const parse = await loadParse().catch(() => null);
        const { patch = {}, day } = choice;
        const stale = toDay(item.createdAt) !== today();
        const draft = computeNlp(parse, {
            input: item.rawText,
            projects,
            tags,
            sourceSurface: "inbox",
            dateStyle: settings?.dateTime?.dateStyle ?? "mdy",
            enabled: settings?.tasks?.intelligence?.nlpEnabled !== false,
            literal: stale,
            manual: manualFromPatch(patch, day),
        });
        const f = draft.fields;
        const task = await processCapture.mutateAsync({
            inboxItemId: item.id,
            rawText: item.rawText,
            title: draft.cleanedTitle || item.rawText,
            dueDate: f.dueDate,
            scheduledStart: f.scheduledStart,
            scheduledEnd: f.scheduledEnd,
            projectId: f.projectId,
            ...(patch.sectionId && { sectionId: patch.sectionId }),
            tagIds: f.tagIds,
            priority: f.priority,
            durationEstimate: f.durationMinutes,
            waitingOn: f.waitingOn,
            recurrenceRule: f.recurrenceRule,
            nlp: resolvedNlp(item.rawText, "inbox", settings?.dateTime?.dateStyle ?? "mdy", [], {}),
        });
        // The capture is placed and kept; what is left (waiting, hiding, a nudge) is a plain edit of the new task.
        const after = followUpEdits(patch, choice.waitlist);
        if (task && Object.keys(after).length) await updateTask.mutateAsync({ id: task.id, ...after });
    }, [processCapture, projects, tags, settings, updateTask]);

    const handleInboxAction = useCallback(async (item: InboxItem, action: "today" | "tomorrow" | "someday" | "delete") => {
        if (action === "delete") await deleteInboxItem.mutateAsync(item.id);
        else if (action === "today") await placeCapture(item, { day: getToday() });
        else if (action === "tomorrow") await placeCapture(item, { day: getTomorrow() });
        else await placeCapture(item, { waitlist: true });
    }, [deleteInboxItem, placeCapture]);

    const handleUnscheduledAction = useCallback(async (task: Task, action: "day" | "someday" | "delete", day?: LocalDate) => {
        if (action === "delete") await archiveTask.mutateAsync(task.id);
        else if (action === "day") await updateTask.mutateAsync({ id: task.id, dueDate: day ?? getToday(), scheduledStart: null, scheduledEnd: null });
        else await updateTask.mutateAsync({ id: task.id, state: "WAITING" });
    }, [archiveTask, updateTask]);

    const handleWaitingAction = useCallback(async (task: Task, action: "today" | "tomorrow" | "keep" | "delete") => {
        if (action === "delete") await archiveTask.mutateAsync(task.id);
        else if (action === "keep") setKeptWaitingIds((prev) => new Set(prev).add(task.id));
        else await updateTask.mutateAsync({ id: task.id, dueDate: action === "today" ? getToday() : getTomorrow(), scheduledStart: null, scheduledEnd: null, state: "ACTIVE" });
    }, [archiveTask, updateTask]);

    const renameCapture = useCallback(async (item: InboxItem, rawText: string) => { await updateInboxItem.mutateAsync({ id: item.id, rawText }); }, [updateInboxItem]);
    const renameTask = useCallback(async (task: Task, title: string) => { await updateTask.mutateAsync({ id: task.id, title }); }, [updateTask]);

    return {
        inboxItems,
        habits,
        renameCapture,
        renameTask,
        unscheduledTasks,
        visibleWaiting,
        habitReviewItems,
        pauseHabit,
        pendingActionKey,
        actionError,
        runCardAction,
        handleInboxAction,
        placeCapture,
        applyInstruction,
        handleUnscheduledAction,
        handleWaitingAction,
        setKeptWaitingIds,
    };
}
