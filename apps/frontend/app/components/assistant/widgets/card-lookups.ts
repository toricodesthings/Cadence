/**
 * Read entity titles out of the react-query caches so change-set / complete /
 * delete cards can render human labels for ids the model only knows by uuid.
 * Falls back to a short id slice when the entity isn't cached.
 */
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/api/query-keys";
import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";

export function useTaskTitleLookup() {
    const queryClient = useQueryClient();
    return (id: string): string => {
        const caches = queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all });
        for (const [, tasks] of caches) {
            if (!Array.isArray(tasks)) continue;
            const found = tasks.find((t) => t.id === id);
            if (found) return found.title;
        }
        return `Task ${id.slice(0, 6)}`;
    };
}

export function useHabitTitleLookup() {
    const queryClient = useQueryClient();
    return (id: string): string => {
        const caches = queryClient.getQueriesData<Habit[]>({ queryKey: queryKeys.habits.all });
        for (const [, habits] of caches) {
            if (!Array.isArray(habits)) continue;
            const found = habits.find((h) => h.id === id);
            if (found) return found.title;
        }
        return "this habit";
    };
}
