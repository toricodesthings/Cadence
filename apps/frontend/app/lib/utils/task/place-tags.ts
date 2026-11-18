import type { QueryClient } from "@tanstack/react-query";
import { tagsForPlace } from "@cadence/domain/auto-tag";
import type { Tag } from "@cadence/contracts/tag";
import type { TaskSection } from "@cadence/contracts/section";
import type { Task } from "@cadence/contracts/task";
import { queryKeys } from "../../api/query-keys";

type Place = { projectId?: string | null; sectionId?: string | null };

/**
 * The tag ids named like a place, from what's already cached (the server decides for real).
 * A cache miss just means no optimistic tag.
 */
export function placeTagIdsFromCache(queryClient: QueryClient, { projectId, sectionId }: Place): string[] {
    if (!projectId) return [];
    const project = queryClient.getQueryData<{ id: string; name: string }[]>(queryKeys.projects.all)?.find(
        (p) => p.id === projectId,
    );
    const section = sectionId
        ? queryClient.getQueryData<TaskSection[]>(["sections", projectId])?.find((s) => s.id === sectionId)
        : undefined;
    return tagsForPlace([project?.name, section?.name], queryClient.getQueryData<Tag[]>(queryKeys.tags.all) ?? []);
}

/** A task's tags after a placement change: the old place's tags go (unless the new place has them), the new place's come. */
export function tagIdsAfterMove(queryClient: QueryClient, task: Task, updates: Place): string[] {
    const projectId = updates.projectId !== undefined ? updates.projectId : task.projectId;
    const sectionId =
        updates.sectionId !== undefined ? updates.sectionId : projectId !== task.projectId ? null : task.sectionId;
    if (projectId === task.projectId && sectionId === task.sectionId) return task.tagIds;
    const to = placeTagIdsFromCache(queryClient, { projectId, sectionId });
    const gone = placeTagIdsFromCache(queryClient, task).filter((id) => !to.includes(id));
    return [...new Set([...task.tagIds.filter((id) => !gone.includes(id)), ...to])];
}
