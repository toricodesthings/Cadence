import { useState } from "react";
import { UserRound } from "lucide-react";
import type { ListPerson } from "@cadence/contracts/sharing";
import type { Project } from "@cadence/contracts/project";
import { useListPeople, usePersonInList } from "../../hooks/sharing/use-list-people";
import { PickerSurface } from "../shared/PickerSurface";
import { ProfileCard } from "./ProfileCard";

const SIZES = {
    16: "size-4 text-[9px]",
    18: "size-[18px] text-[10px]",
    24: "size-6 text-[11px]",
    32: "size-8 text-xs",
} as const;

/** The picture, or the first letter of the name, or a quiet person glyph while who they are is loading. */
export function AvatarFace({
    person,
    size,
    className = "",
}: {
    person: Pick<ListPerson, "name" | "image"> | undefined;
    size: keyof typeof SIZES;
    className?: string;
}) {
    const face = `${SIZES[size]} shrink-0 overflow-hidden rounded-full bg-twilight-surface ring-1 ring-twilight-border ${className}`;
    if (person?.image) return <img src={person.image} alt="" className={`${face} object-cover`} />;
    const initial = person?.name?.trim().charAt(0).toUpperCase();
    return (
        <span className={`${face} inline-flex items-center justify-center font-medium text-twilight-text-soft`}>
            {initial || <UserRound className="size-[60%]" aria-hidden="true" />}
        </span>
    );
}

/**
 * One person in a shared list. A button: a tap or Enter opens their profile card (a popover, or a sheet on a phone).
 * `userId` null = whoever owns the list. The 44px touch target is padding around the small face.
 */
export function PersonAvatar({
    projectId,
    userId,
    size = 18,
    tip,
    className = "",
}: {
    projectId: string | null | undefined;
    userId: string | null | undefined;
    size?: keyof typeof SIZES;
    tip?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const { person, project, former } = usePersonInList(projectId, userId);
    if (!project) return null;
    const label = former ? "A former member" : (person?.name ?? "Member");
    return (
        <PickerSurface
            open={open}
            onOpenChange={setOpen}
            title={label}
            tip={tip ?? label}
            contentProps={{ className: "w-72 p-0 overflow-hidden", align: "end" }}
            flush
            trigger={
                <button
                    type="button"
                    aria-label={`${label}, view profile`}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] [@media(pointer:coarse)]:p-3 [@media(pointer:coarse)]:-m-3 ${className}`}
                >
                    <AvatarFace person={person} size={size} />
                </button>
            }
        >
            <ProfileCard person={person} userId={userId ?? project.userId} former={former} />
        </PickerSurface>
    );
}

/** A list's owner as a small, non-interactive face (the sidebar's "Shared with me" rows). */
export function ListOwnerFace({ project, size = 16 }: { project: Project; size?: keyof typeof SIZES }) {
    const { data: people } = useListPeople(project);
    return <AvatarFace person={people?.find((person) => person.userId === project.userId)} size={size} />;
}
