import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PersonalEventEditorDialog } from "../events/PersonalEventEditorDialog";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";
import type { PersonalEvent } from "../../types/settings";

interface AddPersonalEventDialogProps {
    open: boolean;
    onClose: () => void;
}

export function AddPersonalEventDialog({ open, onClose }: AddPersonalEventDialogProps) {
    const navigate = useNavigate();
    const { addEvent } = usePersonalEvents(new Date().getFullYear());

    const handleSubmit = (value: Omit<PersonalEvent, "id">) => {
        addEvent(value);
        toast.success("Event added", {
            action: {
                label: "View all events",
                onClick: () => navigate("/events"),
            },
        });
        onClose();
    };

    return (
        <PersonalEventEditorDialog
            open={open}
            onClose={onClose}
            title="Add personal event"
            submitLabel="Add event"
            onSubmit={handleSubmit}
        />
    );
}
