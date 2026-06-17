import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
    snapshotHabitCache,
    rollbackHabitCache,
    invalidateHabitCaches,
    cancelHabitQueries,
} from "./optimistic-helpers";
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
                return unwrapResponse<Habit>(res);
            },
        ),

        onMutate: async (input) => {
            await cancelHabitQueries(queryClient);
            const snapshot = snapshotHabitCache(queryClient);

            const optimisticHabit: Habit = {
                id: crypto.randomUUID(),
                userId: "",
                title: input.title,
                description: input.description ?? null,
                archived: false,
                notes: null,
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
                targetMode: input.targetTime ? "ANCHOR" : (input.targetMode ?? "AMBIENT"),
                projectId: input.projectId ?? null,
                sortOrder: input.sortOrder ?? 0,
                pausedUntil: input.pausedUntil ?? null,
                tagIds: input.tagIds ?? [],
                logs: [], // Will be empty until hydrated by weekly query
            };

            queryClient.setQueriesData<Habit[]>(
                { queryKey: queryKeys.habits.all },
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
            if (context?.snapshot) rollbackHabitCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to create habit");
        },

        onSettled: () => invalidateHabitCaches(queryClient),
    });
}
