import { ArrowUpRight, Bell, BellOff, LogOut, Pencil, Trash2, Users } from "lucide-react";
import type { GenericMenu } from "../primitives/menu-styles";
import type { MaybeSharedEvent } from "../../lib/utils/personal-events";
import { isSharedEvent, useEventPeople } from "../../hooks/sharing/use-share-event";
import { eventShareLabel } from "../sharing/SharedEventMark";
import type { EventActions } from "./EventCard";

export function EventMenuItems({
    Menu,
    event,
    onEdit,
    onOpenInSchedule,
    onToggleReminder,
    onShare,
    onDelete,
    onRemoveFromMyEvents,
}: Omit<EventActions, "onOpen"> & {
    Menu: GenericMenu;
    event: MaybeSharedEvent;
}) {
    const isOwner = (event.access ?? "owner") === "owner";
    const shared = isSharedEvent(event);
    const { data: people } = useEventPeople(shared ? event : undefined);

    return (
        <>
            <Menu.Item onSelect={() => onEdit(event)}>
                <Pencil size={14} aria-hidden="true" />
                Edit event
            </Menu.Item>
            <Menu.Item onSelect={() => onOpenInSchedule(event)}>
                <ArrowUpRight size={14} aria-hidden="true" />
                Open in Schedule
            </Menu.Item>
            <Menu.Item onSelect={() => onToggleReminder(event)}>
                {event.notify ? <BellOff size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
                {event.notify ? "Turn off reminder" : "Remind me"}
            </Menu.Item>
            <Menu.Separator />
            {isOwner ? (
                <>
                    {onShare ? (
                        <Menu.Item onSelect={() => onShare(event)}>
                            <Users size={14} aria-hidden="true" />
                            {eventShareLabel(event, people)}
                        </Menu.Item>
                    ) : null}
                    <Menu.Item variant="danger" onSelect={() => onDelete(event)}>
                        <Trash2 size={14} aria-hidden="true" />
                        Delete event
                    </Menu.Item>
                </>
            ) : (
                <Menu.Item variant="danger" onSelect={() => (onRemoveFromMyEvents ?? onDelete)(event)}>
                    <LogOut size={14} aria-hidden="true" />
                    Remove from my events
                </Menu.Item>
            )}
        </>
    );
}
