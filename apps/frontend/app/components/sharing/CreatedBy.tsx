import { usePersonInList } from "../../hooks/sharing/use-list-people";
import { useTaskAccess } from "../../hooks/sharing/use-list-access";
import { PersonAvatar } from "./PersonAvatar";

/**
 * "Created by Ben", on a task in a shared list (nothing elsewhere). `createdBy` null reads as the list's owner; an id
 * that is no longer in the list reads as a former member.
 */
export function createdByLabel(name: string | null | undefined, former: boolean) {
    return former ? "Created by a former member" : name ? `Created by ${name}` : "Created by someone in this list";
}

export function CreatedBy({
    task,
    size = 18,
}: {
    task: { projectId: string | null; createdBy?: string | null };
    size?: 16 | 18;
}) {
    const access = useTaskAccess(task);
    const { person, former, loaded } = usePersonInList(task.projectId, task.createdBy);
    if (!access.isShared || !task.projectId || !loaded) return null;
    return (
        <span className="inline-flex items-center gap-2 text-xs text-twilight-text-soft">
            <PersonAvatar projectId={task.projectId} userId={task.createdBy} size={size} />
            {createdByLabel(person?.name, former)}
        </span>
    );
}
