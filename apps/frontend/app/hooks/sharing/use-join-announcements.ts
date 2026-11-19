import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "../auth/use-api-client";
import { useProjects } from "../projects/use-projects";
import { isOwnList } from "./use-list-access";
import { listPeopleQuery } from "./use-list-people";

/**
 * Tells the owner when someone joins one of their lists. The live socket refetches the lists on a join, so a member
 * of an own list never seen in it before this session is someone who just accepted a link (or did while this device
 * was away). The first read only sets the baseline. People seen once stay seen, so a removal rolled back after a
 * failed write is never announced as a join.
 */
export function useJoinAnnouncements() {
    const { data: projects } = useProjects();
    const queryClient = useQueryClient();
    const client = useApiClient();
    const seen = useRef<Map<string, Set<string>> | null>(null);

    useEffect(() => {
        if (!projects) return;
        const first = !seen.current;
        const known = (seen.current ??= new Map());
        for (const project of projects.filter(isOwnList)) {
            const members = (project.members ?? []).map((member) => member.userId);
            const before = known.get(project.id);
            known.set(project.id, new Set([...(before ?? []), ...members]));
            // A list made in this session starts with nobody in it.
            const joined = first ? [] : members.filter((id) => !before?.has(id));
            if (!joined.length) continue;
            void queryClient.fetchQuery(listPeopleQuery(client, project)).then(
                (people) => {
                    for (const id of joined) {
                        const name = people.find((person) => person.userId === id)?.name ?? "Someone";
                        toast.success(`${name} has accepted your list invite`, { description: project.name });
                    }
                },
                () => toast.success("Someone has accepted your list invite", { description: project.name }),
            );
        }
    }, [projects, queryClient, client]);
}
