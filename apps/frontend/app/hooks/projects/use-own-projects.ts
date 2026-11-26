import { useMemo } from "react";
import { accessOf, isOwnList } from "../sharing/use-list-access";
import { useProjects } from "./use-projects";

export function useOwnProjects() {
    const query = useProjects();
    const data = useMemo(() => query.data?.filter(isOwnList), [query.data]);
    return { ...query, data };
}

export function useEditableProjects() {
    const query = useProjects();
    const data = useMemo(() => query.data?.filter((project) => accessOf(project).canEdit), [query.data]);
    return { ...query, data };
}
