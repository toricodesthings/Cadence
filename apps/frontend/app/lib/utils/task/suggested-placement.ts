import {
    suggestedPlacementSchema,
    suggestedPriorityFromWordsSchema,
    type InboxItem,
    type SuggestedPlacement,
} from "@cadence/contracts/inbox";

export type ThoughtOverrides = {
    title?: string;
    projectId?: string | null;
    sectionId?: string | null;
    tagIds?: string[];
};

export const overridesOf = (item: InboxItem): ThoughtOverrides =>
    (item.analysis?.userOverrides ?? {}) as ThoughtOverrides;

export function storedSuggestion(item: InboxItem): SuggestedPlacement | null {
    const parsed = suggestedPlacementSchema.safeParse(item.analysis?.suggestedPlacement);
    return parsed.success ? parsed.data : null;
}

export function placementFor(
    item: InboxItem,
    { cue, suggestion = storedSuggestion(item) }: { cue?: string | null; suggestion?: SuggestedPlacement | null } = {},
): { projectId: string; sectionId: string | null } | null {
    const picked = overridesOf(item);
    const projectId = picked.projectId !== undefined ? picked.projectId : (cue ?? suggestion?.projectId ?? null);
    if (!projectId) return null;
    const sectionId =
        picked.sectionId !== undefined
            ? picked.sectionId
            : suggestion?.projectId === projectId
              ? suggestion.sectionId
              : null;
    return { projectId, sectionId };
}

export function priorityFromWords(item: InboxItem): number {
    const parsed = suggestedPriorityFromWordsSchema.safeParse(item.analysis?.suggestedPriority);
    return parsed.success ? parsed.data.priority : 0;
}
