import { Users } from "lucide-react";
import type { SharedEvent } from "@cadence/contracts/personal-event";
import type { ListPerson } from "@cadence/contracts/sharing";
import { isSharedEvent, useEventPeople } from "../../hooks/sharing/use-share-event";
import { Tip } from "../primitives/Tooltip";
import { AvatarFace, ProfileFace } from "./PersonAvatar";

/** Plain-language summary of who a date is shared with (Decision 8). */
export function eventShareLabel(
    event: Partial<Pick<SharedEvent, "access" | "members">>,
    people: ListPerson[] | undefined,
): string {
    if ((event.access ?? "owner") !== "owner") {
        const owner = people?.find((p) => p.role === "owner");
        return `Shared by ${owner?.name ?? "someone"}`;
    }
    const members = event.members ?? [];
    if (members.length === 0) return "Share…";
    if (members.length === 1) {
        const member = people?.find((p) => p.role !== "owner");
        return `Shared with ${member?.name ?? "1 person"}`;
    }
    return `Shared with ${members.length} people`;
}

function SharedEventMarkContent({
    event,
    size,
    className,
}: {
    event: Pick<SharedEvent, "id"> & Partial<Pick<SharedEvent, "access" | "members">>;
    size: 16 | 18;
    className: string;
}) {
    const { data: people } = useEventPeople(event);
    const owner = people?.find((p) => p.role === "owner");
    const tip = eventShareLabel(event, people);

    return (
        <span
            data-no-open="true"
            className={`inline-flex shrink-0 items-center gap-1 text-twilight-text-muted ${className}`}
        >
            <Tip label={tip}>
                <span className="inline-flex items-center" aria-label={tip}>
                    <Users size={12} aria-hidden="true" className="shrink-0" />
                </span>
            </Tip>
            {(event.access ?? "owner") !== "owner" && owner ? <AvatarFace person={owner} size={size} /> : null}
        </span>
    );
}

/** One quiet shared mark for yearly events (Decision 8 & 17): `Users` icon, plus owner avatar when shared with you. */
export function SharedEventMark({
    event,
    size = 16,
    className = "",
}: {
    event: Pick<SharedEvent, "id"> & Partial<Pick<SharedEvent, "access" | "members">>;
    size?: 16 | 18;
    className?: string;
}) {
    if (!isSharedEvent(event)) return null;
    return <SharedEventMarkContent event={event} size={size} className={className} />;
}

function EventPeopleLineContent({
    event,
    className,
}: {
    event: Pick<SharedEvent, "id"> & Partial<Pick<SharedEvent, "access" | "members">>;
    className: string;
}) {
    const { data: people } = useEventPeople(event);
    const mine = (event.access ?? "owner") === "owner";
    // The other side: an owner sees who they shared with; someone it was shared with sees the owner.
    const faces = (people ?? []).filter((p) => (p.role === "owner") !== mine).slice(0, 3);
    return (
        <span
            data-no-open="true"
            className={`inline-flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-twilight-text-soft ${className}`}
        >
            <Users size={14} aria-hidden="true" className="shrink-0" />
            {faces.length > 0 ? (
                <span className="inline-flex shrink-0 items-center -space-x-1">
                    {faces.map((person) => (
                        <ProfileFace key={person.userId} person={person} userId={person.userId} showRole={false} />
                    ))}
                </span>
            ) : null}
            <span className="min-w-0 truncate">{eventShareLabel(event, people)}</span>
        </span>
    );
}

/** Who a shared date is with: the other people's faces (profile card on hover or tap) and the plain label. */
export function EventPeopleLine({
    event,
    className = "",
}: {
    event: Pick<SharedEvent, "id"> & Partial<Pick<SharedEvent, "access" | "members">>;
    className?: string;
}) {
    if (!isSharedEvent(event)) return null;
    return <EventPeopleLineContent event={event} className={className} />;
}
