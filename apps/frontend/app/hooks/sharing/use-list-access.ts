import { useMemo } from "react";
import type { Project } from "@cadence/contracts/project";
import type { ListRole } from "@cadence/contracts/sharing";
import type { Task } from "@cadence/contracts/task";
import { useProjects } from "../projects/use-projects";

export type ListAccessInfo = { role: ListRole; isShared: boolean; canEdit: boolean; isOwner: boolean };

/** Unknown access reads as the caller's own, as everywhere else. */
export const isOwnList = (project: Pick<Project, "access">) => !project.access || project.access === "owner";

const OWN: ListAccessInfo = { role: "owner", isShared: false, canEdit: true, isOwner: true };

/** What the caller may do in a list. An unknown list (not loaded yet, or none) is the caller's own. */
export function accessOf(project: Pick<Project, "access" | "members"> | undefined): ListAccessInfo {
    if (!project) return OWN;
    // A list cached before sharing has neither field: it is the caller's own.
    const role = project.access ?? "owner";
    return {
        role,
        isShared: role !== "owner" || (project.members?.length ?? 0) > 0,
        canEdit: role !== "view",
        isOwner: role === "owner",
    };
}

export function useListAccess(projectId: string | null | undefined): ListAccessInfo {
    const { data: projects } = useProjects();
    const project = projectId ? projects?.find((entry) => entry.id === projectId) : undefined;
    return useMemo(() => accessOf(project), [project]);
}

/** The access of the list a task sits in. */
export function useTaskAccess(task: Pick<Task, "projectId"> | undefined): ListAccessInfo {
    return useListAccess(task?.projectId);
}
