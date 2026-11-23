import { usePersonInList } from "../../hooks/sharing/use-list-people";
import { useTaskAccess } from "../../hooks/sharing/use-list-access";
import { PersonAvatar } from "./PersonAvatar";

/**
 * "Created by Ben" or "Edited by Sam", on a task in a shared list (nothing elsewhere). `createdBy` null reads as the
 * list's owner; an id that is no longer in the list reads as a former member.
 */
export function personAttributionLabel(verb: "Created" | "Edited", name: string | null | undefined, former: boolean) {
    return former ? `${verb} by a former member` : name ? `${verb} by ${name}` : `${verb} by someone in this list`;
}

export function createdByLabel(name: string | null | undefined, former: boolean) {
    return personAttributionLabel("Created", name, former);
}

export function CreatedBy({
    task,
    verb = "Created",
    size = 18,
}: {
    task: { projectId: string | null; userId?: string; createdBy?: string | null; updatedBy?: string | null };
    verb?: "Created" | "Edited";
    size?: 16 | 18;
}) {
    const access = useTaskAccess(task);
    const subjectId = verb === "Edited" ? task.updatedBy : task.createdBy;
    const { person, project, former, loaded } = usePersonInList(task.projectId, subjectId);
    if (!access.isShared || !task.projectId || !loaded) return null;
    if (verb === "Edited") {
        const creatorId = task.createdBy ?? task.userId ?? project?.userId;
        if (!task.updatedBy || task.updatedBy === creatorId) return null;
    }
    return (
        <span className="inline-flex items-center gap-2 text-xs text-twilight-text-soft">
            <PersonAvatar projectId={task.projectId} userId={subjectId} size={size} />
            {personAttributionLabel(verb, person?.name, former)}
        </span>
    );
}
