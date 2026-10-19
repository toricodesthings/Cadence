import { createContext, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { TimeOfDay } from "@cadence/contracts/planning";
import type { Task } from "@cadence/contracts/task";
import type { Proposal } from "@cadence/domain/find-time";
import { taskDay } from "@cadence/domain/task-recurrence";
import type { LocalDate } from "@cadence/domain/time";
import { useApiClient } from "../auth/use-api-client";
import { useSettings } from "../core/use-settings";
import { useDurationGuesser } from "../ai/use-duration-guess";
import { usePlanningEvidence } from "../ai/use-planning-evidence";
import { useProjects } from "../projects/use-projects";
import { tasksQueryOptions } from "./use-tasks";
import { useUpdateTask } from "./use-update-task";
import { planDay, proposalTime, type DayPlan } from "../../lib/planning/day-plan";
import { toastName, toastUndo } from "../../lib/utils/undo-toast";
import { toastError } from "../../lib/utils/error-toast";
import { FindTimeToast } from "../../components/tasks/FindTimeToast";
import { temporalOf } from "../../lib/utils/calendar/schedule-model";
import { isRecurringTask, isRecurringTaskInstance } from "../../lib/utils/task/task-scheduling";
import { getUserZone, today } from "../../lib/utils/user-zone";
import { useFindTimeStore } from "../../stores/find-time-store";

/** The day Place is showing: its tasks' menus say "Find a time on Tue" and look at that day. */
export const FindTimeDayContext = createContext<LocalDate | null>(null);

/** A task Find a time can place: open, one-off, not a Fixed block. */
export const canFindTime = (task: Pick<Task, "state" | "interactionMode" | "recurrenceRule" | "isHabit" | "seriesId" | "isRecurringInstance">) =>
    task.state !== "COMPLETE" && task.state !== "ARCHIVED" && task.interactionMode !== "timetable" && !task.isHabit && !isRecurringTask(task as Task) && !isRecurringTaskInstance(task as Task);

/** The day Find a time looks at for a task: its own day if that is today or later, else today. */
export const findTimeDay = (task: Pick<Task, "scheduledStart" | "dueDate">): LocalDate => {
    const own = taskDay({ scheduledStart: task.scheduledStart, dueDate: task.dueDate }, getUserZone());
    return own && own >= today() ? own : today();
};

export const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;

/**
 * Find a time: one tap puts the task in the first gap that fits, on the day, and the same message offers Another time,
 * Other day and Undo. The calendar is the preview and Undo is the approval, the same contract as a drag. Nothing
 * else moves, and no gap that day opens the sheet instead, writing nothing.
 */
export function useFindTime() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const updateTask = useUpdateTask();
    const guessOf = useDurationGuesser();
    const evidence = usePlanningEvidence();
    const { data: settings } = useSettings();
    const { data: projects } = useProjects();
    const openSheet = useFindTimeStore((s) => s.open);
    const timelineStartHour = settings?.calendar?.timelineStartHour ?? 7;

    /** The day's tasks from the network when reachable, else whatever is cached (an offline plan is still a plan). */
    const dayTasks = useCallback(async (day: LocalDate): Promise<Task[]> => {
        const options = tasksQueryOptions(client, { range: { from: day, to: day } });
        try {
            return await queryClient.fetchQuery({ ...options, staleTime: 15_000 });
        } catch {
            return queryClient.getQueryData<Task[]>(options.queryKey) ?? [];
        }
    }, [client, queryClient]);

    /** The plan for a day whose tasks are already in hand (the phone's agenda has them). */
    const planWith = useCallback((task: Task, day: LocalDate, tasksOnDay: readonly Task[], now = new Date()): DayPlan =>
        planDay({
            task, day, zone: getUserZone(), now, timelineStartHour, evidence, guess: guessOf(task),
            listName: projects?.find((p) => p.id === task.projectId)?.name ?? null,
            dayTasks: tasksOnDay,
        }), [evidence, guessOf, projects, timelineStartHour]);

    const planFor = useCallback(async (task: Task, day: LocalDate): Promise<DayPlan> => planWith(task, day, await dayTasks(day)), [dayTasks, planWith]);

    /** Writes a proposal as the task's block. `shown` is every time of day the person has seen in this run: a pick among at least two is what teaches. */
    const write = useCallback((task: Task, proposal: Proposal, shown: TimeOfDay[]) =>
        updateTask.mutateAsync({
            id: task.id,
            ...(task.scheduledStart ? {} : { dueDate: null, endDate: null }),
            scheduledStart: proposal.start,
            scheduledEnd: proposal.end,
            findTime: { shown },
        }), [updateTask]);

    const run = useCallback(async (task: Task, options: { day?: LocalDate; prefix?: string } = {}): Promise<void> => {
        const day = options.day ?? findTimeDay(task);
        const anchorDay = taskDay({ scheduledStart: task.scheduledStart, dueDate: task.dueDate }, getUserZone());
        const plan = await planFor(task, day);
        if (plan.proposals.length === 0) {
            openSheet({ taskId: task.id, day, anchorDay, reason: "no-gap" });
            return;
        }
        const before = temporalOf(task);
        let seen: TimeOfDay[] = [];
        const apply = async (index: number): Promise<void> => {
            const proposal = plan.proposals[index];
            seen = [...new Set([...seen, proposal.bucket])];
            try {
                await write(task, proposal, seen);
            } catch (error) {
                // The task changed elsewhere meanwhile: look again and place the new first gap.
                if (statusOf(error) === 409) {
                    toast.dismiss(toastId);
                    await run({ ...task, ...before }, { day, prefix: "Your calendar changed" });
                    return;
                }
                throw error;
            }
        };

        const toastId = toast.custom(
            (id) => (
                <FindTimeToast
                    id={id}
                    title={task.title}
                    zone={getUserZone()}
                    proposals={plan.proposals}
                    prefix={options.prefix}
                    onApply={apply}
                    onOtherDay={() => openSheet({ taskId: task.id, day, anchorDay })}
                    onUndo={() => void updateTask.mutateAsync({ id: task.id, ...before, findTime: { undo: true } })}
                />
            ),
            // Closed by the toast itself, which waits while it is hovered or focused.
            { duration: Infinity },
        );
        try {
            await apply(0);
        } catch {
            toast.dismiss(toastId); // the write failed and said so itself; a placement offer for nothing would only mislead
        }
    }, [openSheet, planFor, updateTask, write]);

    /** Later today: the first gap from now, written with Undo. It was Cadence's choice, so it teaches nothing. */
    const placeLater = useCallback(async (task: Task, proposal: Proposal): Promise<void> => {
        const before = temporalOf(task);
        try {
            await write(task, proposal, [proposal.bucket]);
        } catch (error) {
            // Any other failure already said why; a lost race is quiet in the write, so it is said here.
            if (statusOf(error) === 409) toastError(error, "Couldn't move it to later today");
            return;
        }
        toastUndo(toastName(task.title, 40), () => void updateTask.mutateAsync({ id: task.id, ...before, findTime: { undo: true } }), {
            description: `Later today · ${proposalTime(proposal.start)}`,
        });
    }, [updateTask, write]);

    return { run, planFor, planWith, write, placeLater, canFindTime };
}

/**
 * For today's phone agenda: what swiping a task left offers as "Later": the first gap from now, or nothing when
 * today has none. `tasks` are today's tasks as the agenda shows them.
 */
export function useLaterToday(day: LocalDate, tasks: readonly Task[], enabled: boolean) {
    const { planWith, placeLater } = useFindTime();
    return useCallback((task: Task): { time: string; place: () => void } | null => {
        // Later is for what hasn't happened yet: an untimed task, or a block whose time has passed. A block still ahead
        // today would be offered its own slot (the nearest gap to it), which moves nothing.
        if (!enabled || !canFindTime(task) || (task.scheduledStart && Date.parse(task.scheduledStart) > Date.now())) return null;
        const first = planWith(task, day, tasks).proposals[0];
        return first ? { time: proposalTime(first.start), place: () => void placeLater(task, first) } : null;
    }, [day, enabled, placeLater, planWith, tasks]);
}
