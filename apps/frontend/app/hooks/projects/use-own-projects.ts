import { useMemo } from "react";
import { accessOf, isOwnList } from "../sharing/use-list-access";
import { useProjects } from "./use-projects";

/** The caller's own lists (used where shared lists don't apply, such as Routines). */
export function useOwnProjects() {
    const query = useProjects();
    const data = useMemo(() => query.data?.filter(isOwnList), [query.data]);
    return { ...query, data };
}

/** Every list the caller can add or move tasks into: their own lists plus shared lists where they can edit. */
export function useEditableProjects() {
    const query = useProjects();
    const data = useMemo(() => query.data?.filter((project) => accessOf(project).canEdit), [query.data]);
    return { ...query, data };
}
