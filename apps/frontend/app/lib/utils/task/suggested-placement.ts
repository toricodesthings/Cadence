import { suggestedPlacementSchema, suggestedPriorityFromWordsSchema, type InboxItem, type SuggestedPlacement } from "@cadence/contracts/inbox";

/** What the user set on a thought before it became a task (Clarify, the row menu), saved at `analysis.userOverrides`. */
export type ThoughtOverrides = { title?: string; projectId?: string | null; sectionId?: string | null; tagIds?: string[] };

export const overridesOf = (item: InboxItem): ThoughtOverrides => (item.analysis?.userOverrides ?? {}) as ThoughtOverrides;

/** The list and section the server suggested for a capture, if it stored one. */
export function storedSuggestion(item: InboxItem): SuggestedPlacement | null {
    const parsed = suggestedPlacementSchema.safeParse(item.analysis?.suggestedPlacement);
    return parsed.success ? parsed.data : null;
}

/**
 * Where a thought lands: the list the user picked (a picked "None" is null), else a cue word's list (`cue`), else the
 * stored suggestion. The section is the user's pick, else the suggestion's when it is for that same list.
 * `suggestion` defaults to the stored one; Clarify passes the one it opened with.
 */
export function placementFor(
    item: InboxItem,
    { cue, suggestion = storedSuggestion(item) }: { cue?: string | null; suggestion?: SuggestedPlacement | null } = {},
): { projectId: string; sectionId: string | null } | null {
    const picked = overridesOf(item);
    const projectId = picked.projectId !== undefined ? picked.projectId : (cue ?? suggestion?.projectId ?? null);
    if (!projectId) return null;
    const sectionId = picked.sectionId !== undefined ? picked.sectionId : suggestion?.projectId === projectId ? suggestion.sectionId : null;
    return { projectId, sectionId };
}

/** The priority read from the capture's own words by the model (0 when none): shown as "from your words" and used when the parser found none. */
export function priorityFromWords(item: InboxItem): number {
    const parsed = suggestedPriorityFromWordsSchema.safeParse(item.analysis?.suggestedPriority);
    return parsed.success ? parsed.data.priority : 0;
}
