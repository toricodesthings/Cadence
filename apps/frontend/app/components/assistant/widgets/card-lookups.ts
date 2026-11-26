import { isLocalDate } from "@cadence/domain/time";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/api/query-keys";
import { formatShortDate, formatShortDateTime } from "../../../lib/utils/date-format";
import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";
import type { Tag } from "@cadence/contracts/tag";
import type { TaskSection } from "@cadence/contracts/section";
import type { InboxItem } from "@cadence/contracts/inbox";

export function useTaskLookup() {
    const queryClient = useQueryClient();
    return (id: string): Task | undefined => {
        for (const [, tasks] of queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all })) {
            const found = Array.isArray(tasks) ? tasks.find((t) => t.id === id) : undefined;
            if (found) return found;
        }
        return undefined;
    };
}

export function useTaskTitleLookup() {
    const lookup = useTaskLookup();
    return (id: string): string => lookup(id)?.title ?? `Task ${id.slice(0, 6)}`;
}

export function useTagsLookup() {
    const queryClient = useQueryClient();
    return (ids: string[]): Tag[] => {
        const all = queryClient.getQueryData<Tag[]>(queryKeys.tags.all) ?? [];
        return ids.flatMap((id) => all.find((t) => t.id === id) ?? []);
    };
}

export function useSectionLookup() {
    const queryClient = useQueryClient();
    return (id: string): TaskSection | undefined => {
        for (const [, sections] of queryClient.getQueriesData<TaskSection[]>({ queryKey: ["sections"] })) {
            const found = Array.isArray(sections) ? sections.find((s) => s.id === id) : undefined;
            if (found) return found;
        }
        return undefined;
    };
}

export function useCaptureLookup() {
    const queryClient = useQueryClient();
    return (id: string): InboxItem | undefined => {
        for (const [, items] of queryClient.getQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all })) {
            const found = Array.isArray(items) ? items.find((item) => item.id === id) : undefined;
            if (found) return found;
        }
        return undefined;
    };
}

export function useHabitLookup() {
    const queryClient = useQueryClient();
    return (id: string): Habit | undefined => {
        const caches = queryClient.getQueriesData<Habit[]>({ queryKey: queryKeys.habits.all });
        for (const [, habits] of caches) {
            if (!Array.isArray(habits)) continue;
            const found = habits.find((h) => h.id === id);
            if (found) return found;
        }
        return undefined;
    };
}

export function formatWhen(value?: string | null): string | null {
    if (!value) return null;
    if (isLocalDate(value)) return formatShortDate(value);
    return Number.isNaN(Date.parse(value)) ? null : formatShortDateTime(value);
}
