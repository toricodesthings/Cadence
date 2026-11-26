import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { PlaceTaskItem, Task } from "@cadence/contracts/task";
import { busyBlocks, dayHoursOf, dayWindow, type Busy } from "@cadence/domain/find-time";
import { fitDay, fitMinutes, isFitCandidate, type FitDayResult } from "@cadence/domain/fit-day";
import { preferredBuckets } from "@cadence/domain/slot-preference";
import { taskDay } from "@cadence/domain/task-recurrence";
import type { LocalDate } from "@cadence/domain/time";
import { useApiClient } from "../auth/use-api-client";
import { useSettings } from "../core/use-settings";
import { useDurationGuesser } from "../ai/use-duration-guess";
import { usePlanningEvidence } from "../ai/use-planning-evidence";
import { useProjects } from "../projects/use-projects";
import { useLoadShare } from "../sharing/use-load-share";
import { useTasks } from "./use-tasks";
import { unwrapResponse } from "../../lib/api/helpers";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";
import { toastUndo } from "../../lib/utils/undo-toast";
import { getUserZone, today, useToday } from "../../lib/utils/user-zone";

export type FitPlacement = FitDayResult["placed"][number];

export function useFitDay(day: LocalDate, enabled = true) {
    const todayDay = useToday();
    const isToday = day === todayDay;
    const own = useTasks(
        isToday
            ? { state: "ACTIVE", effectiveOnOrBeforeDate: day, enabled }
            : { range: { from: day, to: day }, enabled },
    );
    const onDay = useTasks({ range: { from: day, to: day }, enabled });
    const guessOf = useDurationGuesser();
    const evidence = usePlanningEvidence();
    const { data: projects } = useProjects();
    const { data: settings } = useSettings();
    const hours = useMemo(() => dayHoursOf(settings), [settings]);
    const shareOf = useLoadShare();

    const candidates = useMemo(() => {
        const zone = getUserZone();
        const open = (own.data ?? []).filter((t) => isFitCandidate(t) && shareOf(t) === 1);
        return [
            ...open.filter((t) => (taskDay(t, zone) ?? day) < day),
            ...open.filter((t) => (taskDay(t, zone) ?? day) >= day),
        ];
    }, [day, own.data, shareOf]);
    const byId = useMemo(() => new Map(candidates.map((t) => [t.id, t])), [candidates]);
    const busy = useMemo<Busy[]>(
        () =>
            busyBlocks(
                (onDay.data ?? []).filter((t) => !t.isHabit && shareOf(t) > 0),
                "",
            ),
        [onDay.data, shareOf],
    );
    const minutesOf = useCallback((task: Task) => fitMinutes(task, guessOf(task)), [guessOf]);

    const plan = useCallback(
        (tasks: readonly Task[] = candidates, alsoBusy: readonly Busy[] = []): FitDayResult => {
            const zone = getUserZone();
            return fitDay(
                tasks
                    .filter((t) => isFitCandidate(t) && shareOf(t) === 1)
                    .map((t) => ({ ...t, minutes: minutesOf(t), notBefore: t.notBefore ?? null })),
                { day, zone, now: new Date().toISOString(), ...hours, busy: [...busy, ...alsoBusy] },
                (t, feasible) =>
                    preferredBuckets(
                        evidence ?? { records: [], stated: [] },
                        {
                            title: t.title,
                            projectId: t.projectId ?? null,
                            listName: projects?.find((p) => p.id === t.projectId)?.name ?? null,
                        },
                        feasible,
                        todayDay,
                    ),
            );
        },
        [busy, candidates, day, evidence, minutesOf, projects, hours, todayDay, shareOf],
    );

    const ready = !!own.data && !!onDay.data;
    const refresh = useCallback(async () => {
        await Promise.all([own.refetch(), onDay.refetch()]);
    }, [own, onDay]);
    return { ready, candidates, byId, busy, plan, minutesOf, refresh, hours };
}

export type FitDay = ReturnType<typeof useFitDay>;

export function fitTodayReason(fit: FitDay, tasks: readonly Task[], now = new Date()): string | null {
    const zone = getUserZone();
    if (dayWindow(today(), fit.hours, zone).to <= now.getTime()) return "Today's gaps have passed";
    if (!fit.ready) return null;
    const candidates = tasks.filter(isFitCandidate);
    if (!candidates.length) return "No untimed tasks on today";
    const result = fit.plan(candidates);
    return result.placed.length || result.notSized.length ? null : "Nothing untimed fits today's gaps";
}

export function usePlaceTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    const send = useCallback(
        async (items: PlaceTaskItem[]) => {
            const result = await unwrapResponse(await client.api.tasks.place.$post({ json: { items } }));
            result.tasks.forEach((task) => reconcileTaskInCaches(queryClient, task));
            void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all, refetchType: "active" });
            return result;
        },
        [client, queryClient],
    );

    return useCallback(
        async (placements: readonly FitPlacement[], tasks: ReadonlyMap<string, Task>) => {
            const result = await send(
                placements.map((p) => ({
                    id: p.taskId,
                    scheduledStart: p.start,
                    scheduledEnd: p.end,
                    dueDate: null,
                    endDate: null,
                    expectedUpdatedAt: tasks.get(p.taskId)!.updatedAt,
                })),
            );
            const versions = new Map(result.tasks.map((t) => [t.id, t.updatedAt]));
            const undo = async (previous = result.previous): Promise<void> => {
                try {
                    await send(previous.map((p) => ({ ...p, expectedUpdatedAt: versions.get(p.id)! })));
                } catch (error) {
                    const changed = new Set(
                        (error as { issues?: { path: string }[] }).issues?.map((i) => i.path) ?? [],
                    );
                    const rest = previous.filter((p) => !changed.has(p.id));
                    if (!changed.size || rest.length === previous.length)
                        return void toastError(error, "Couldn't undo");
                    if (rest.length) await undo(rest);
                    toast.message(`${changed.size} changed since`, { description: "Kept as you changed it" });
                }
            };
            const n = result.tasks.length;
            toastUndo(`${n} ${n === 1 ? "task" : "tasks"} placed`, () => void undo());
            return result;
        },
        [send],
    );
}
