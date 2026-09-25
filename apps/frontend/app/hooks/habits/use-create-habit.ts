import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { habitCache } from "./optimistic-helpers";
import type { Habit, InsertHabit } from "@cadence/contracts/habit";
import { toast } from "sonner";
import { reconcileHabitInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { toISODate } from "../../lib/utils/date-format";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

export function useCreateHabit() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<InsertHabit, Habit>(
            (input) => ({
                type: "create_habit",
                payload: { ...input, clientMutationId: crypto.randomUUID() } as Record<string, unknown> & { clientMutationId: string },
            }),
            async (input) => {
                const res = await client.api.habits.$post({
                    json: input,
                });
                return unwrapResponse(res);
            },
        ),

        onMutate: async (input) => {
            await habitCache.cancel(queryClient);
            const snapshot = habitCache.snapshot(queryClient);

            const optimisticHabit: Habit = {
                id: crypto.randomUUID(),
                userId: "",
                title: input.title,
                description: input.description ?? null,
                archived: false,
                notes: null,
                steps: input.steps ?? null,
                recurrenceRule: input.recurrenceRule,
                targetTime: input.targetTime ?? null,
                reminderEnabled: input.reminderEnabled ?? false,
                colorAccent: input.colorAccent ?? "lantern",
                totalCompletions: 0,
                totalSkips: 0,
                currentStreak: 0,
                longestStreak: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                targetTimes: input.targetTimes ?? null,
                emoji: input.emoji ?? null,
                projectId: input.projectId ?? null,
                sortOrder: input.sortOrder ?? 0,
                pausedUntil: input.pausedUntil ?? null,
                tagIds: input.tagIds ?? [],
                logs: [], // Will be empty until hydrated by weekly query
            };

            queryClient.setQueriesData<Habit[]>(
                { queryKey: queryKeys.habits.all, exact: true },
                (old) => transformListCache(old, (items) => [...items, optimisticHabit], { initialize: true }),
            );

            const today = toISODate(new Date());
            const optimisticWithLog: Habit = {
                ...optimisticHabit,
                logs: [{ id: `virtual-${optimisticHabit.id}-${today}`, habitId: optimisticHabit.id, status: "PENDING", targetDate: `${today}T00:00:00.000Z`, completedAt: null }],
            };

            queryClient
                .getQueriesData<Habit[]>({ queryKey: queryKeys.habits.weeklyAll })
                .forEach(([key, old]) => {
                    const filters = key[2] as { start?: string; end?: string } | undefined;
                    const archivedFlag = key.at(-1);
                    if (!filters?.start || !filters?.end || archivedFlag !== false) return;
                    if (today < filters.start || today > filters.end) return;

                    queryClient.setQueryData(
                        key,
                        transformListCache(old, (items) => [...items, optimisticWithLog], { initialize: true }),
                    );
                });

            return { snapshot, optimisticId: optimisticHabit.id };
        },

        onSuccess: (habit, _input, context) => {
            if (!habit) return; // Queued offline
            reconcileHabitInCaches(queryClient, habit, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) habitCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Couldn't create routine");
        },

        onSettled: () => habitCache.invalidate(queryClient),
    });
}
