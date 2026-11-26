import { queryOptions } from "@tanstack/react-query";
import type { Project } from "@cadence/contracts/project";
import type { ListPerson } from "@cadence/contracts/sharing";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { useAuthedQuery } from "../auth/use-authed-query";
import { useProjects } from "../projects/use-projects";
import { isOwnList } from "./use-list-access";

export const memberIdsOf = (project: Pick<Project, "userId" | "members">) =>
    [project.userId, ...(project.members ?? []).map((member) => member.userId)].sort();

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

export function useListPeople(project: Project | undefined) {
    return useAuthedQuery(
        (client) =>
            queryOptions({
                ...listPeopleQuery(client, project),
                select: (people) =>
                    people.map((person) => {
                        const member = project?.members?.find((entry) => entry.userId === person.userId);
                        return member ? { ...person, role: member.role } : person;
                    }),
            }),
        Boolean(project && (!isOwnList(project) || (project.members?.length ?? 0) > 0)),
    );
}

export function usePersonInList(projectId: string | null | undefined, userId: string | null | undefined) {
    const { data: projects } = useProjects();
    const project = projectId ? projects?.find((entry) => entry.id === projectId) : undefined;
    const { data: people } = useListPeople(project);
    const id = userId ?? project?.userId;
    return {
        project,
        person: people?.find((entry: ListPerson) => entry.userId === id),
        loaded: Boolean(people),
        former: Boolean(people && id && !people.some((entry: ListPerson) => entry.userId === id)),
    };
}
