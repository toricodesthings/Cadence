import { createContext, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { TimeOfDay } from "@cadence/contracts/planning";
import type { Task } from "@cadence/contracts/task";
import { dayHoursOf, type Proposal } from "@cadence/domain/find-time";
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

export const FindTimeDayContext = createContext<LocalDate | null>(null);

export const canFindTime = (
    task: Pick<Task, "state" | "interactionMode" | "recurrenceRule" | "isHabit" | "seriesId" | "isRecurringInstance">,
) =>
    task.state !== "COMPLETE" &&
    task.state !== "ARCHIVED" &&
    task.interactionMode !== "timetable" &&
    !task.isHabit &&
    !isRecurringTask(task as Task) &&
    !isRecurringTaskInstance(task as Task);

export const findTimeDay = (task: Pick<Task, "scheduledStart" | "dueDate">): LocalDate => {
    const own = taskDay({ scheduledStart: task.scheduledStart, dueDate: task.dueDate }, getUserZone());
    return own && own >= today() ? own : today();
};

export const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;

export function useFindTime() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const updateTask = useUpdateTask();
    const guessOf = useDurationGuesser();
    const evidence = usePlanningEvidence();
    const { data: settings } = useSettings();
    const { data: projects } = useProjects();
    const openSheet = useFindTimeStore((s) => s.open);
    const { timelineStartHour, dayEndHour } = dayHoursOf(settings);

    const dayTasks = useCallback(
        async (day: LocalDate): Promise<Task[]> => {
            const options = tasksQueryOptions(client, { range: { from: day, to: day } });
            try {
                return await queryClient.fetchQuery({ ...options, staleTime: 15_000 });
            } catch {
                return queryClient.getQueryData<Task[]>(options.queryKey) ?? [];
            }
        },
        [client, queryClient],
    );

    const planWith = useCallback(
        (task: Task, day: LocalDate, tasksOnDay: readonly Task[], now = new Date()): DayPlan =>
            planDay({
                task,
                day,
                zone: getUserZone(),
                now,
                timelineStartHour,
                dayEndHour,
                evidence,
                guess: guessOf(task),
                listName: projects?.find((p) => p.id === task.projectId)?.name ?? null,
                dayTasks: tasksOnDay,
            }),
        [evidence, guessOf, projects, timelineStartHour, dayEndHour],
    );

    const planFor = useCallback(
        async (task: Task, day: LocalDate): Promise<DayPlan> => planWith(task, day, await dayTasks(day)),
        [dayTasks, planWith],
    );

    const write = useCallback(
        (task: Task, proposal: Proposal, shown: TimeOfDay[]) =>
            updateTask.mutateAsync({
                id: task.id,
                ...(task.scheduledStart ? {} : { dueDate: null, endDate: null }),
                scheduledStart: proposal.start,
                scheduledEnd: proposal.end,
                findTime: { shown },
            }),
        [updateTask],
    );

    const run = useCallback(
        async (task: Task, options: { day?: LocalDate; prefix?: string } = {}): Promise<void> => {
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
                    if (statusOf(error) === 409) {
                        toast.dismiss(toastId);
                        await run({ ...task, ...before }, { day, prefix: "Your calendar changed" });
                        return;
                    }
                    throw error;
                }
            };

            const undo = () => updateTask.mutateAsync({ id: task.id, ...before, findTime: { undo: true } });
            const toastId = toast.custom(
                (id) => (
                    <FindTimeToast
                        id={id}
                        title={task.title}
                        zone={getUserZone()}
                        proposals={plan.proposals}
                        prefix={options.prefix}
                        onApply={apply}
                        onOtherDay={() =>
                            void undo()
                                .catch(() => {})
                                .finally(() => openSheet({ taskId: task.id, day, anchorDay }))
                        }
                        onUndo={() => void undo()}
                    />
                ),
                { duration: Infinity },
            );
            try {
                await apply(0);
            } catch {
                toast.dismiss(toastId);
            }
        },
        [openSheet, planFor, updateTask, write],
    );

    const placeLater = useCallback(
        async (task: Task, proposal: Proposal): Promise<void> => {
            const before = temporalOf(task);
            try {
                await write(task, proposal, [proposal.bucket]);
            } catch (error) {
                if (statusOf(error) === 409) toastError(error, "Couldn't move it to later today");
                return;
            }
            toastUndo(
                toastName(task.title, 40),
                () => void updateTask.mutateAsync({ id: task.id, ...before, findTime: { undo: true } }),
                {
                    description: `Later today · ${proposalTime(proposal.start)}`,
                },
            );
        },
        [updateTask, write],
    );

    return { run, planFor, planWith, write, placeLater, canFindTime };
}

export function useLaterToday(day: LocalDate, tasks: readonly Task[], enabled: boolean) {
    const { planWith, placeLater } = useFindTime();
    return useCallback(
        (task: Task): { time: string; place: () => void } | null => {
            if (!enabled || !canFindTime(task) || (task.scheduledStart && Date.parse(task.scheduledStart) > Date.now()))
                return null;
            const first = planWith(task, day, tasks).proposals[0];
            return first ? { time: proposalTime(first.start), place: () => void placeLater(task, first) } : null;
        },
        [day, enabled, placeLater, planWith, tasks],
    );
}
