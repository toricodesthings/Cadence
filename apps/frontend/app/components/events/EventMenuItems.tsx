import { Bell, BellOff, Calendar, Pencil, Trash2 } from "lucide-react";
import type { GenericMenu } from "../primitives/menu-styles";
import type { PersonalEvent } from "../../types/settings";
import type { EventActions } from "./EventCard";

/** An event's actions, in its right-click menu (card) and its ⋯ menu (row): one set of words for both. */
export function EventMenuItems({ Menu, event, onEdit, onOpenInSchedule, onToggleReminder, onDelete }: Omit<EventActions, "onOpen"> & {
    Menu: GenericMenu;
    event: PersonalEvent;
}) {
    return (
        <>
            <Menu.Item onSelect={() => onEdit(event)}><Pencil size={14} aria-hidden="true" />Edit event</Menu.Item>
            <Menu.Item onSelect={() => onOpenInSchedule(event)}><Calendar size={14} aria-hidden="true" />Open in schedule</Menu.Item>
            <Menu.Item onSelect={() => onToggleReminder(event)}>
                {event.notify ? <BellOff size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
                {event.notify ? "Turn off reminder" : "Remind me"}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item variant="danger" onSelect={() => onDelete(event)}><Trash2 size={14} aria-hidden="true" />Delete event</Menu.Item>
        </>
    );
}
