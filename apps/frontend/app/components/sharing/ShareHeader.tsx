import { Eye, Users } from "lucide-react";
import type { Project } from "@cadence/contracts/project";
import { Button } from "../primitives/Button";
import { Tip } from "../primitives/Tooltip";
import { useListPeople } from "../../hooks/sharing/use-list-people";
import { AvatarFace } from "./PersonAvatar";

const STACK = 3;

/** Beside the list's title, on a list shared with you as view-only. */
export function ViewOnlyBadge() {
    return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent-primary/35 bg-accent-primary/10 px-2.5 py-0.5 align-middle font-sans text-xs font-medium tracking-normal text-accent-primary">
            <Eye size={12} aria-hidden="true" />
            View only
        </span>
    );
}

/**
 * A list header's sharing control. The owner gets "Share"; someone let in gets the faces of the people in it (three,
 * then "+n"), both opening the share surface.
 */
export function ShareHeader({ project, onOpen }: { project: Project; onOpen: () => void }) {
    const owner = project.access === "owner";
    const { data: people } = useListPeople(project);

    if (owner)
        return (
            <Tip label={project.members?.length ? "Shared. See who's in it" : "Share this list"}>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={project.members?.length ? "People in this list" : "Share list"}
                    onClick={onOpen}
                >
                    <Users size={18} aria-hidden="true" />
                </Button>
            </Tip>
        );

    const shown = (people ?? []).slice(0, STACK);
    const more = Math.max(0, (people?.length ?? (project.members?.length ?? 0) + 1) - STACK);
    return (
        <div className="flex items-center gap-2">
            <Tip label="People in this list">
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label="People in this list"
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-1"
                >
                    <span className="flex -space-x-1.5">
                        {shown.map((person) => (
                            <AvatarFace
                                key={person.userId}
                                person={person}
                                size={24}
                                className="ring-2 ring-twilight-base"
                            />
                        ))}
                    </span>
                    {more > 0 && <span className="ml-1.5 text-xs text-twilight-text-soft">+{more}</span>}
                </button>
            </Tip>
        </div>
    );
}
