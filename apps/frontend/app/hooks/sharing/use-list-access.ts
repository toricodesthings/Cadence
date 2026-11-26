import { useMemo } from "react";
import type { Project } from "@cadence/contracts/project";
import type { ListRole } from "@cadence/contracts/sharing";
import type { Task } from "@cadence/contracts/task";
import { useProjects } from "../projects/use-projects";

export type ListAccessInfo = { role: ListRole; isShared: boolean; canEdit: boolean; isOwner: boolean };

export const isOwnList = (project: Pick<Project, "access">) => !project.access || project.access === "owner";

export const isSharedList = (project: Pick<Project, "access" | "members">) =>
    !isOwnList(project) || (project.members?.length ?? 0) > 0;

const OWN: ListAccessInfo = { role: "owner", isShared: false, canEdit: true, isOwner: true };

export function accessOf(project: Pick<Project, "access" | "members"> | undefined): ListAccessInfo {
    if (!project) return OWN;
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

export function useTaskAccess(task: Pick<Task, "projectId"> | undefined): ListAccessInfo {
    return useListAccess(task?.projectId);
}
