import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { habitCache } from "./optimistic-helpers";
import type { ResolveHabitAction, Habit } from "@cadence/contracts/habit";
import { toast } from "sonner";
import { reconcileHabitInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { toISODate } from "../../lib/utils/date-format";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { stepDayStatus } from "@cadence/domain/repeats";

const latestResolveByCell = new Map<string, string>();

function makeCellKey(habitId: string, targetDate: string) {
    return `${habitId}:${toISODate(new Date(targetDate))}`;
}

/** Pass `habitId` per call when one hook instance resolves many habits (e.g. schedule rows). */
type ResolveVariables = ResolveHabitAction & { habitId?: string };

export function useResolveHabit(boundHabitId?: string) {
    const idOf = (vars: ResolveVariables) => vars.habitId ?? boundHabitId ?? "";
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            ResolveVariables,
            { habit: Habit; requestId: string; requestKey: string }
        >(
            (action) => ({
                type: "resolve_habit",
                id: idOf(action),
                payload: { targetDate: action.targetDate, status: action.status, stepStatus: action.stepStatus, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            }),
            async (vars) => {
                const habitId = idOf(vars);
                const { habitId: _omit, ...action } = vars;
                const requestKey = makeCellKey(habitId, action.targetDate);
                const requestId = crypto.randomUUID();
                latestResolveByCell.set(requestKey, requestId);
                const res = await client.api.habits[":id"].resolve.$post({
                    param: { id: habitId },
                    // The caller's zone makes "today" (and the streak) their day.
                    json: { ...action, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                });
                return {
                    ...(await unwrapResponse<{ habit: Habit }>(res)),
                    requestId,
                    requestKey,
                };
            },
        ),
        onMutate: async (action) => {
            const habitId = idOf(action);
            await habitCache.cancel(queryClient);
            const snapshot = habitCache.snapshot(queryClient);
            const requestKey = makeCellKey(habitId, action.targetDate);

            // Helper to update a habit's log status in-place
            const applyUpdate = (habits: Habit[] | undefined): Habit[] | undefined => {
                return transformListCache(habits, (items) =>
                    items.map((habit) => {
                        if (habit.id !== habitId) return habit;
                        // Same rule as the server: step marks decide the day's status.
                        const stepIds = (habit.steps ?? []).map((step) => step.id);
                        const next = stepIds.length && action.stepStatus
                            ? stepDayStatus(stepIds, action.stepStatus)
                            : { status: action.status, stepStatus: null };
                        const newLogs = habit.logs?.map((log) => {
                            if (log.targetDate.substring(0, 10) === action.targetDate.substring(0, 10)) {
                                return { ...log, ...next };
                            }
                            return log;
                        });
                        return { ...habit, logs: newLogs };
                    }),
                );
            };

            // Update the flat list (habits.all)
            queryClient.setQueriesData<Habit[]>(
                { queryKey: queryKeys.habits.all },
                applyUpdate,
            );

            // Update each weekly query variant
            queryClient.setQueriesData<Habit[]>(
                { queryKey: queryKeys.habits.weeklyAll },
                applyUpdate,
            );

            return { snapshot, requestKey };
        },
        onSuccess: (result) => {
            if (!result) return; // Queued offline
            if (latestResolveByCell.get(result.requestKey) !== result.requestId) {
                return;
            }
            reconcileHabitInCaches(queryClient, result.habit);
            latestResolveByCell.delete(result.requestKey);
        },
        onError: (err, _action, context) => {
            if (context?.requestKey) {
                latestResolveByCell.delete(context.requestKey);
            }
            if (context?.snapshot) habitCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Couldn't update routine");
        },
        onSettled: () => habitCache.invalidate(queryClient),
    });
}
