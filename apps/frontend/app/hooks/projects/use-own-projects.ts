import { useMemo } from "react";
import { isOwnList } from "../sharing/use-list-access";
import { useProjects } from "./use-projects";

/** The lists a person can put things in or move them to: their own. Lists shared with them are worked in place, never picked. */
export function useOwnProjects() {
    const query = useProjects();
    const data = useMemo(() => query.data?.filter(isOwnList), [query.data]);
    return { ...query, data };
}
