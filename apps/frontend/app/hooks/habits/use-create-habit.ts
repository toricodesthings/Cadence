import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { habitCache } from "./optimistic-helpers";
import type { Habit, InsertHabit } from "@cadence/contracts/habit";
import { reconcileHabitInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { today as getToday } from "../../lib/utils/user-zone";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { toastError } from "../../lib/utils/error-toast";
import { clientIdFor } from "../../lib/api/optimistic-id";

function optimisticHabitFrom(input: InsertHabit): Habit {
    const {
        description = null,
        steps = null,
        targetTime = null,
        reminderEnabled = false,
        colorAccent = "lantern",
        targetTimes = null,
        times = null,
        emoji = null,
        projectId = null,
        sortOrder = Number.MAX_SAFE_INTEGER,
        pausedUntil = null,
        tagIds = [],
    } = input;
    return {
        id: clientIdFor(input),
        userId: "",
        title: input.title,
        description,
        archived: false,
        notes: null,
        steps,
        recurrenceRule: input.recurrenceRule,
        targetTime,
        reminderEnabled,
        colorAccent,
        totalCompletions: 0,
        totalSkips: 0,
        currentStreak: 0,
        longestStreak: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        targetTimes,
        times,
        emoji,
        projectId,
        sortOrder,
        pausedUntil,
        tagIds,
        logs: [],
    };
}

function addToWeeks(queryClient: QueryClient, habit: Habit, today: string) {
    queryClient.getQueriesData<Habit[]>({ queryKey: queryKeys.habits.weeklyAll }).forEach(([key, old]) => {
        const filters = key[2] as { start?: string; end?: string } | undefined;
        const archivedFlag = key.at(-1);
        if (!filters?.start || !filters?.end || archivedFlag !== false) return;
        if (today < filters.start || today > filters.end) return;

        queryClient.setQueryData(
            key,
            transformListCache(old, (items) => [...items, habit], { initialize: true }),
        );
    });
}

export function useCreateHabit() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<InsertHabit, Habit>(
            (input) => ({
                type: "create_habit",
                payload: { ...input, id: clientIdFor(input) },
            }),
            async (input) => {
                const id = clientIdFor(input);
                const res = await client.api.habits.$post(
                    { json: { ...input, id } },
                    { headers: { "Idempotency-Key": id } },
                );
                return unwrapResponse(res);
            },
        ),

        onMutate: async (input) => {
            await habitCache.cancel(queryClient);
            const snapshot = habitCache.snapshot(queryClient);

            const optimisticHabit = optimisticHabitFrom(input);

            queryClient.setQueriesData<Habit[]>({ queryKey: queryKeys.habits.all, exact: true }, (old) =>
                transformListCache(old, (items) => [...items, optimisticHabit], { initialize: true }),
            );

            const today = getToday();
            const optimisticWithLog: Habit = {
                ...optimisticHabit,
                logs: [
                    {
                        id: `virtual-${optimisticHabit.id}-${today}`,
                        habitId: optimisticHabit.id,
                        status: "PENDING",
                        targetDate: today,
                        completedAt: null,
                    },
                ],
            };

            addToWeeks(queryClient, optimisticWithLog, today);

            return { snapshot, optimisticId: optimisticHabit.id };
        },

        onSuccess: (habit, _input, context) => {
            if (!habit) return;
            reconcileHabitInCaches(queryClient, habit, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context) habitCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't create routine");
        },

        onSettled: (data, error) => habitCache.settle(queryClient, data, error),
    });
}
