import { queryOptions } from "@tanstack/react-query";
import type { Project } from "@cadence/contracts/project";
import type { ListPerson } from "@cadence/contracts/sharing";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { useAuthedQuery } from "../auth/use-authed-query";
import { useProjects } from "../projects/use-projects";
import { isOwnList } from "./use-list-access";

/** Everyone in the list: the owner and each member, as the list row names them. */
export const memberIdsOf = (project: Pick<Project, "userId" | "members">) =>
    [project.userId, ...(project.members ?? []).map((member) => member.userId)].sort();

/** The people in one list, keyed by who is in it: a join or a removal reads them afresh. */
export const listPeopleQuery = (client: ApiClient, project: Project | undefined) =>
    queryOptions({
        queryKey: queryKeys.listPeople(project?.id ?? "", project ? memberIdsOf(project) : []),
        staleTime: STALE_TIMES.PEOPLE,
        meta: { persist: false },
        queryFn: async () => {
            const res = await client.api.lists[":id"].people.$get({ param: { id: project!.id } });
            return unwrapResponse(res);
        },
    });

/** The people in a shared list (name, picture, pronouns, role). Never fetched for a list nobody else is in. */
export function useListPeople(project: Project | undefined) {
    return useAuthedQuery(
        (client) =>
            queryOptions({
                ...listPeopleQuery(client, project),
                // The key holds ids only, so a role change keeps the cached people: roles come from the list row,
                // which changes at once (and rolls back) with the owner's choice.
                select: (people) =>
                    people.map((person) => {
                        const member = project?.members?.find((entry) => entry.userId === person.userId);
                        return member ? { ...person, role: member.role } : person;
                    }),
            }),
        Boolean(project && (!isOwnList(project) || (project.members?.length ?? 0) > 0)),
    );
}

/** One person in the list a task sits in. `null` creator = the owner. Undefined while loading, or for a former member. */
export function usePersonInList(projectId: string | null | undefined, userId: string | null | undefined) {
    const { data: projects } = useProjects();
    const project = projectId ? projects?.find((entry) => entry.id === projectId) : undefined;
    const { data: people } = useListPeople(project);
    const id = userId ?? project?.userId;
    return {
        project,
        person: people?.find((entry: ListPerson) => entry.userId === id),
        loaded: Boolean(people),
        /** Their id reads as nobody left in the list. */
        former: Boolean(people && id && !people.some((entry: ListPerson) => entry.userId === id)),
    };
}
