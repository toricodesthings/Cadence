import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PersonalEventEditorDialog } from "../events/PersonalEventEditorDialog";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";
import type { PersonalEvent } from "../../types/settings";

/** Saves a new personal event and confirms with a link to the Events page. */
export function useAddPersonalEvent() {
    const navigate = useNavigate();
    const { addEvent } = usePersonalEvents(new Date().getFullYear());
    return (value: Omit<PersonalEvent, "id">) => {
        addEvent(value);
        toast.success("Event added", {
            action: { label: "View all events", onClick: () => navigate("/events") },
        });
    };
}

export function AddPersonalEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const addEvent = useAddPersonalEvent();
    return (
        <PersonalEventEditorDialog
            open={open}
            onClose={onClose}
            title="Add personal event"
            submitLabel="Add event"
            onSubmit={(value) => { addEvent(value); onClose(); }}
        />
    );
}
