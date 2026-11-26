import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { habitCache } from "./optimistic-helpers";
import { isLastWrite } from "../../lib/api/write-gate";
import type { ResolveHabitAction, Habit } from "@cadence/contracts/habit";
import { reconcileHabitInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { applyTimeMark, nextOpenTime, stepDayStatus, timeMarksOn } from "@cadence/domain/repeats";
import { wallTimeOf } from "@cadence/domain/time";
import { getUserZone } from "../../lib/utils/user-zone";
import { toastError } from "../../lib/utils/error-toast";

export function timeAction(time: string, status: ResolveHabitAction["status"], at = new Date().toISOString()) {
    return { time, status, at };
}

function withNextTime(queryClient: QueryClient, habitId: string, vars: ResolveVariables): ResolveVariables {
    if (vars.time || vars.status !== "COMPLETED") return vars;
    const habit = queryClient
        .getQueriesData<Habit[]>({ queryKey: queryKeys.habits.all })
        .flatMap(([, data]) => (Array.isArray(data) ? data : []))
        .find(
            (entry) =>
                entry.id === habitId &&
                entry.times?.length &&
                entry.logs?.some((log) => log.targetDate === vars.targetDate),
        );
    if (!habit) return vars;
    const log = habit.logs?.find((entry) => entry.targetDate === vars.targetDate);
    const time = nextOpenTime(habit.times!, timeMarksOn(habit.times!, log), wallTimeOf(new Date(), getUserZone()));
    return time ? { ...vars, ...timeAction(time, "COMPLETED") } : vars;
}

type ResolveVariables = ResolveHabitAction & { habitId?: string };

export function useResolveHabit(boundHabitId?: string) {
    const idOf = (vars: ResolveVariables) => vars.habitId ?? boundHabitId ?? "";
    const client = useApiClient();
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: withOfflineSupport<ResolveVariables, { habit: Habit }>(
            (action) => ({
                type: "resolve_habit",
                id: idOf(action),
                payload: {
                    targetDate: action.targetDate,
                    status: action.status,
                    stepStatus: action.stepStatus,
                    time: action.time,
                    at: action.at,
                },
            }),
            async (vars) => {
                const habitId = idOf(vars);
                const { habitId: _omit, ...action } = vars;
                const res = await client.api.habits[":id"].resolve.$post({
                    param: { id: habitId },
                    json: action,
                });
                return unwrapResponse(res);
            },
        ),
        onMutate: async (action) => {
            const habitId = idOf(action);
            await habitCache.cancel(queryClient);
            const snapshot = habitCache.snapshot(queryClient);

            const applyUpdate = (habits: Habit[] | undefined): Habit[] | undefined => {
                return transformListCache(habits, (items) =>
                    items.map((habit) => {
                        if (habit.id !== habitId) return habit;
                        const stepIds = (habit.steps ?? []).map((step) => step.id);
                        const next = habit.times?.length
                            ? applyTimeMark(
                                  habit.times,
                                  habit.logs?.find((log) => log.targetDate === action.targetDate),
                                  {
                                      time: action.time,
                                      status: action.status,
                                      at: action.at ?? new Date().toISOString(),
                                  },
                              )
                            : stepIds.length && action.stepStatus
                              ? stepDayStatus(stepIds, action.stepStatus)
                              : { status: action.status, stepStatus: null };
                        const newLogs = habit.logs?.map((log) => {
                            if (log.targetDate === action.targetDate) {
                                return { ...log, ...next };
                            }
                            return log;
                        });
                        return { ...habit, logs: newLogs };
                    }),
                );
            };

            queryClient.setQueriesData<Habit[]>({ queryKey: queryKeys.habits.all }, applyUpdate);

            queryClient.setQueriesData<Habit[]>({ queryKey: queryKeys.habits.weeklyAll }, applyUpdate);

            return { snapshot };
        },
        onSuccess: (result) => {
            if (!result || !isLastWrite(queryClient)) return;
            reconcileHabitInCaches(queryClient, result.habit);
        },
        onError: (err, _action, context) => {
            if (context) habitCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't update routine");
        },
        onSettled: (data, error) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.routineDurationAll });
            habitCache.settle(queryClient, data, error);
        },
    });
    return {
        ...mutation,
        mutate: ((vars, options) =>
            mutation.mutate(withNextTime(queryClient, idOf(vars), vars), options)) as typeof mutation.mutate,
        mutateAsync: ((vars, options) =>
            mutation.mutateAsync(withNextTime(queryClient, idOf(vars), vars), options)) as typeof mutation.mutateAsync,
    };
}
