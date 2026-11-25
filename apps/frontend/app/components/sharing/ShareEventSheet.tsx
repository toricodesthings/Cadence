import type { SharedEvent } from "@cadence/contracts/personal-event";
import type { ListPerson } from "@cadence/contracts/sharing";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import {
    useCreateEventLink,
    useEventPeople,
    useRemoveFromEvent,
    useResetEventLinks,
    useStopSharingEvent,
} from "../../hooks/sharing/use-share-event";
import { CopyLinkButton } from "./ShareListDialog";
import { SharePersonRow, ShareSheetFooter, ShareSheetShell } from "./ShareSheetParts";

function ShareEventBody({
    event,
    onClose,
    withDone = true,
}: {
    event: SharedEvent;
    onClose: () => void;
    withDone?: boolean;
}) {
    const { session } = useAuthState();
    const me = session?.user;
    const isOwner = event.access === "owner";
    const shared = event.members.length > 0;
    const { data: fetched } = useEventPeople(event);
    const createLink = useCreateEventLink();
    const resetLinks = useResetEventLinks();
    const removePerson = useRemoveFromEvent();
    const stopSharing = useStopSharingEvent();

    const people: ListPerson[] | undefined =
        fetched ??
        (isOwner && !shared && me
            ? [{ userId: me.id, name: me.name ?? null, image: me.image ?? null, pronouns: null, role: "owner" }]
            : undefined);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 px-1">
                <span className="text-2xl leading-none" aria-hidden="true">
                    {event.emoji ?? "🎉"}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-twilight-text">{event.label}</p>
                    <p className="mt-0.5 text-sm text-twilight-text-soft text-pretty">
                        Anyone with the link can add it to their events. You&apos;ll both see it and can both change it.
                    </p>
                </div>
            </div>

            {isOwner ? (
                <div className="rounded-[22px] surface-item p-1.5">
                    <CopyLinkButton
                        pending={createLink.isPending}
                        onCopy={(done) => createLink.mutate(event.id, { onSuccess: ({ copied }) => copied && done() })}
                    />
                </div>
            ) : null}

            {people && people.length > 0 ? (
                <ul
                    aria-label="People this date is shared with"
                    className="flex flex-col gap-0.5 rounded-[22px] surface-item p-1.5"
                >
                    {people.map((person) => (
                        <SharePersonRow
                            key={person.userId}
                            person={person}
                            avatarSize={32}
                            showPronouns
                            isYou={person.userId === me?.id}
                            canRemove={isOwner && person.role !== "owner"}
                            onRemove={() => removePerson.mutate({ eventId: event.id, userId: person.userId })}
                        />
                    ))}
                </ul>
            ) : null}

            <ShareSheetFooter
                showOwnerActions={isOwner && shared}
                stopTitle="Stop sharing this date?"
                stopDescription="Everyone else loses it from their events and old links stop working. It stays on your Events page."
                onStopSharing={() => stopSharing.mutate(event.id)}
                resetLabel="Reset link"
                resetPending={resetLinks.isPending}
                onResetLinks={() => resetLinks.mutate(event.id)}
                withDone={withDone}
                onClose={onClose}
            />
        </div>
    );
}

/** Share a yearly date with the people it belongs to (Decision 8). */
export function ShareEventSheet({
    event,
    open,
    onOpenChange,
}: {
    event: SharedEvent;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <ShareSheetShell
            title="Share this date"
            description="Share this date by link or stop sharing with people."
            open={open}
            onOpenChange={onOpenChange}
        >
            {({ onClose, withDone }) => <ShareEventBody event={event} onClose={onClose} withDone={withDone} />}
        </ShareSheetShell>
    );
}
