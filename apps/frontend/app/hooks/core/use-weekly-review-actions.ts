import { useState, useMemo, useCallback } from "react";
import { useInbox } from "../inbox/use-inbox";
import { useDeleteInboxItem } from "../inbox/use-delete-inbox-item";
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

export interface HabitReviewItem {
    id: string;
    title: string;
    completedThisWeek: number;
    skippedThisWeek: number;
    pendingThisWeek: number;
    totalThisWeek: number;
    hasTargetTime: boolean;
}

const getToday = today;
const getTomorrow = () => addDays(today(), 1);

export function useWeeklyReviewActions(currentStep: number) {
    const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [keptWaitingIds, setKeptWaitingIds] = useState<Set<string>>(new Set());

    const { data: inboxItems = [] } = useInbox();
    const { data: activeTasks = [] } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks = [] } = useTasks({ state: "WAITING" });

    const updateTask = useUpdateTask();
    const archiveTask = useArchiveTask();
    const deleteInboxItem = useDeleteInboxItem();
    const processCapture = useProcessInboxToTask();
    const { apply: applyInstruction } = useApplyInstruction();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: settings } = useSettings();

    const unscheduledTasks = useMemo(
        () => activeTasks.filter((t) => !t.dueDate && !t.scheduledStart),
        [activeTasks],
    );

    const visibleWaiting = waitingTasks.filter((t) => !keptWaitingIds.has(t.id));

    // Habit stats
    const todayDay = useToday();
    const { data: habits = [] } = useHabitsRange({
        start: addDays(todayDay, -7),
        end: todayDay,
        enabled: currentStep === 4,
    });

    const habitStats = useMemo(() => {
        let total = 0;
        let completed = 0;
        for (const h of habits) {
            const logs = h.logs ?? [];
            total += logs.length;
            completed += logs.filter((l: any) => l.status === "COMPLETED").length;
        }
        return { total, completed };
    }, [habits]);

    const habitReviewItems = useMemo<HabitReviewItem[]>(() => {
        return habits
            .filter((h) => !h.archived)
            .map((h) => {
                const logs = h.logs ?? [];
                return {
                    id: h.id,
                    title: h.title,
                    completedThisWeek: logs.filter((l: any) => l.status === "COMPLETED").length,
                    skippedThisWeek: logs.filter((l: any) => l.status === "SKIPPED").length,
                    pendingThisWeek: logs.filter((l: any) => l.status === "PENDING").length,
                    totalThisWeek: logs.length,
                    hasTargetTime: !!h.targetTime,
                };
            });
    }, [habits]);

    const pauseHabit = usePauseHabit();

    const runCardAction = useCallback(async (actionKey: string, actionFn: () => Promise<void>) => {
        if (pendingActionKey) return;
        setPendingActionKey(actionKey);
        setActionError(null);
        try {
            await actionFn();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Something went wrong while processing this step.");
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
            confidenceThreshold: settings?.tasks?.intelligence?.confidenceThreshold ?? "medium",
            enabled: settings?.tasks?.intelligence?.nlpEnabled !== false,
            literal: stale,
            manual: {
                dueDate: patch.dueDate !== undefined ? patch.dueDate : (day ?? null),
                // The placement is the user's call here; the capture's own date words never decide it.
                scheduledStart: patch.scheduledStart ?? null,
                scheduledEnd: patch.scheduledEnd ?? null,
                ...(patch.projectId && { projectId: patch.projectId }),
                ...(patch.addTagIds && { tagIds: patch.addTagIds }),
                ...(patch.priority && { priority: patch.priority }),
                ...(patch.waitingOn && { waitingOn: patch.waitingOn }),
                ...(patch.durationEstimate && { durationMinutes: patch.durationEstimate }),
            },
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
        const { state, notBefore, waitingReminder } = patch;
        const after = { ...(choice.waitlist ? { state: "WAITING" as const } : state ? { state } : {}), ...(notBefore ? { notBefore } : {}), ...(waitingReminder ? { waitingReminder } : {}) };
        if (task && Object.keys(after).length) await updateTask.mutateAsync({ id: task.id, ...after });
    }, [processCapture, projects, tags, settings, updateTask]);

    const handleInboxAction = useCallback(async (item: InboxItem, action: "today" | "tomorrow" | "someday" | "delete") => {
        if (action === "delete") await deleteInboxItem.mutateAsync(item.id);
        else if (action === "today") await placeCapture(item, { day: getToday() });
        else if (action === "tomorrow") await placeCapture(item, { day: getTomorrow() });
        else await placeCapture(item, { waitlist: true });
    }, [deleteInboxItem, placeCapture]);

    const handleUnscheduledAction = useCallback(async (task: Task, action: "today" | "tomorrow" | "someday" | "delete") => {
        if (action === "delete") {
            await archiveTask.mutateAsync(task.id);
        } else if (action === "today") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getToday(), scheduledStart: null, scheduledEnd: null });
        } else if (action === "tomorrow") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getTomorrow(), scheduledStart: null, scheduledEnd: null });
        } else if (action === "someday") {
            await updateTask.mutateAsync({ id: task.id, state: "WAITING" });
        }
    }, [archiveTask, updateTask]);

    const handleWaitingAction = useCallback(async (task: Task, action: "today" | "tomorrow" | "keep" | "delete") => {
        if (action === "delete") {
            await archiveTask.mutateAsync(task.id);
        } else if (action === "today") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getToday(), scheduledStart: null, scheduledEnd: null, state: "ACTIVE" });
        } else if (action === "tomorrow") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getTomorrow(), scheduledStart: null, scheduledEnd: null, state: "ACTIVE" });
        } else if (action === "keep") {
            setKeptWaitingIds((prev) => new Set(prev).add(task.id));
        }
    }, [archiveTask, updateTask]);

    return {
        inboxItems,
        unscheduledTasks,
        visibleWaiting,
        habitStats,
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
