import { Users } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { useTaskAccess } from "../../hooks/sharing/use-list-access";
import { usePersonInList } from "../../hooks/sharing/use-list-people";
import { Tip } from "../primitives/Tooltip";
import { AvatarFace, PersonAvatar } from "./PersonAvatar";

type SharedMarkTask = Pick<Task, "projectId" | "createdBy" | "takenBy">;

/** One shared mark, the same everywhere (Law 7): taker beats creator; inside the list, avatar only. */
export function SharedMark({
    task,
    inList = false,
    interactive = true,
    size = 16,
    className = "",
}: {
    task: SharedMarkTask;
    inList?: boolean;
    /** False when rendered inside an interactive row button (e.g. search results) to avoid nested buttons. */
    interactive?: boolean;
    size?: 16 | 18;
    className?: string;
}) {
    const access = useTaskAccess(task);
    if (!access.isShared || !task.projectId) return null;
    return (
        <SharedMarkContent
            projectId={task.projectId}
            createdBy={task.createdBy}
            takenBy={task.takenBy}
            inList={inList}
            interactive={interactive}
            size={size}
            className={className}
        />
    );
}

function SharedMarkContent({
    projectId,
    createdBy,
    takenBy,
    inList,
    interactive,
    size,
    className,
}: {
    projectId: string;
    createdBy?: string | null;
    takenBy?: string | null;
    inList: boolean;
    interactive: boolean;
    size: 16 | 18;
    className: string;
}) {
    const subjectId = takenBy ?? createdBy;
    const { person, project, former } = usePersonInList(projectId, subjectId);

    const listName = project?.name ?? "Shared list";
    const personName = former ? "a former member" : (person?.name ?? "someone");
    const tip = takenBy
        ? `Shared · ${listName} · ${personName} is doing it`
        : `Shared · ${listName} · added by ${personName}`;

    const avatar = interactive ? (
        <PersonAvatar projectId={projectId} userId={subjectId} size={size} tip={tip} />
    ) : (
        <AvatarFace person={person} size={size} />
    );

    if (inList) {
        return interactive ? (
            <PersonAvatar projectId={projectId} userId={subjectId} size={size} tip={tip} className={className} />
        ) : (
            <AvatarFace person={person} size={size} className={className} />
        );
    }

    return (
        <span
            data-no-open="true"
            data-no-dnd="true"
            className={`inline-flex shrink-0 items-center gap-1 text-twilight-text-muted ${className}`}
        >
            <Tip label={tip}>
                <span className="inline-flex items-center" aria-label={tip}>
                    <Users size={12} aria-hidden="true" className="shrink-0" />
                </span>
            </Tip>
            {avatar}
        </span>
    );
}
