import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { PlaceTaskItem, Task } from "@cadence/contracts/task";
import { busyBlocks, DAY_END, type Busy } from "@cadence/domain/find-time";
import { fitDay, fitMinutes, isFitCandidate, type FitDayResult } from "@cadence/domain/fit-day";
import { preferredBuckets } from "@cadence/domain/slot-preference";
import { taskDay } from "@cadence/domain/task-recurrence";
import { atLocal, type LocalDate } from "@cadence/domain/time";
import { useApiClient } from "../auth/use-api-client";
import { useSettings } from "../core/use-settings";
import { useDurationGuesser } from "../ai/use-duration-guess";
import { usePlanningEvidence } from "../ai/use-planning-evidence";
import { useProjects } from "../projects/use-projects";
import { useTasks } from "./use-tasks";
import { unwrapResponse } from "../../lib/api/helpers";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";
import { toastUndo } from "../../lib/utils/undo-toast";
import { getUserZone, today, useToday } from "../../lib/utils/user-zone";

export type FitPlacement = FitDayResult["placed"][number];

/**
 * Fit today, on the device: the day's untimed tasks, their known lengths and the busy blocks, and the one rule
 * (`@cadence/domain/fit-day`) over them. Today's own set includes what's still open from earlier days, first.
 * `plan(ordered)` lays out the given tasks (Today passes its visible order) or the day's own order.
 */
export function useFitDay(day: LocalDate, enabled = true) {
    const todayDay = useToday();
    const isToday = day === todayDay;
    const own = useTasks(isToday ? { state: "ACTIVE", effectiveOnOrBeforeDate: day, enabled } : { range: { from: day, to: day }, enabled });
    const onDay = useTasks({ range: { from: day, to: day }, enabled });
    const guessOf = useDurationGuesser();
    const evidence = usePlanningEvidence();
    const { data: projects } = useProjects();
    const { data: settings } = useSettings();
    const timelineStartHour = settings?.calendar?.timelineStartHour ?? 7;

    const candidates = useMemo(() => {
        const zone = getUserZone();
        const open = (own.data ?? []).filter(isFitCandidate);
        // Still open from earlier days first, as Today shows them.
        return [...open.filter((t) => (taskDay(t, zone) ?? day) < day), ...open.filter((t) => (taskDay(t, zone) ?? day) >= day)];
    }, [day, own.data]);
    const byId = useMemo(() => new Map(candidates.map((t) => [t.id, t])), [candidates]);
    // A routine is a point in the day, never a block to keep clear of.
    const busy = useMemo<Busy[]>(() => busyBlocks((onDay.data ?? []).filter((t) => !t.isHabit), ""), [onDay.data]);
    const minutesOf = useCallback((task: Task) => fitMinutes(task, guessOf(task)), [guessOf]);

    /** Lays `tasks` (default: the day's own order) into the day's gaps, around `busy` plus `alsoBusy`. */
    const plan = useCallback((tasks: readonly Task[] = candidates, alsoBusy: readonly Busy[] = []): FitDayResult => {
        const zone = getUserZone();
        return fitDay(
            tasks.filter(isFitCandidate).map((t) => ({ ...t, minutes: minutesOf(t), notBefore: t.notBefore ?? null })),
            { day, zone, now: new Date().toISOString(), timelineStartHour, busy: [...busy, ...alsoBusy] },
            (t, feasible) => preferredBuckets(
                evidence ?? { records: [], stated: [] },
                { title: t.title, projectId: t.projectId ?? null, listName: projects?.find((p) => p.id === t.projectId)?.name ?? null },
                feasible,
                todayDay,
            ),
        );
    }, [busy, candidates, day, evidence, minutesOf, projects, timelineStartHour, todayDay]);

    const ready = !!own.data && !!onDay.data;
    const refresh = useCallback(async () => { await Promise.all([own.refetch(), onDay.refetch()]); }, [own, onDay]);
    return { ready, candidates, byId, busy, plan, minutesOf, refresh, timelineStartHour };
}

export type FitDay = ReturnType<typeof useFitDay>;

/** Why the menu item can't help right now, or null when it can. Kept in place, disabled, rather than hidden. */
export function fitTodayReason(fit: FitDay, tasks: readonly Task[], now = new Date()): string | null {
    const zone = getUserZone();
    if (Date.parse(atLocal(today(), DAY_END, zone)) <= now.getTime()) return "Today's gaps have passed";
    if (!fit.ready) return null;
    const candidates = tasks.filter(isFitCandidate);
    if (!candidates.length) return "No untimed tasks on today";
    const result = fit.plan(candidates);
    return result.placed.length || result.notSized.length ? null : "Nothing untimed fits today's gaps";
}

/**
 * `POST /tasks/place` for a whole preview, then one toast with one Undo. Undo sends each task's values from before;
 * a task edited since keeps the person's edit and the toast says so. Throws the request's error (a 409 names the
 * changed tasks in `issues`), so the preview can look again.
 */
export function usePlaceTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    const send = useCallback(async (items: PlaceTaskItem[]) => {
        const result = await unwrapResponse(await client.api.tasks.place.$post({ json: { items } }));
        result.tasks.forEach((task) => reconcileTaskInCaches(queryClient, task));
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all, refetchType: "active" });
        return result;
    }, [client, queryClient]);

    return useCallback(async (placements: readonly FitPlacement[], tasks: ReadonlyMap<string, Task>) => {
        const result = await send(placements.map((p) => ({
            id: p.taskId, scheduledStart: p.start, scheduledEnd: p.end, dueDate: null, endDate: null, expectedUpdatedAt: tasks.get(p.taskId)!.updatedAt,
        })));
        const versions = new Map(result.tasks.map((t) => [t.id, t.updatedAt]));
        const undo = async (previous = result.previous): Promise<void> => {
            try {
                await send(previous.map((p) => ({ ...p, expectedUpdatedAt: versions.get(p.id)! })));
            } catch (error) {
                // Put back the rest; what changed since keeps the person's edit.
                const changed = new Set((error as { issues?: { path: string }[] }).issues?.map((i) => i.path) ?? []);
                const rest = previous.filter((p) => !changed.has(p.id));
                if (!changed.size || rest.length === previous.length) return void toastError(error, "Couldn't undo");
                if (rest.length) await undo(rest);
                toast.message(`${changed.size} changed since`, { description: "Kept as you changed it" });
            }
        };
        const n = result.tasks.length;
        toastUndo(`${n} ${n === 1 ? "task" : "tasks"} placed`, () => void undo());
        return result;
    }, [send]);
}
