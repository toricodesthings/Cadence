import { PersonalEventEditorDialog } from "../events/PersonalEventEditorDialog";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";

export function useAddPersonalEvent() {
    return usePersonalEvents(new Date().getFullYear()).addEvent;
}

export function AddPersonalEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const addEvent = useAddPersonalEvent();
    return (
        <PersonalEventEditorDialog
            open={open}
            onClose={onClose}
            title="Add personal event"
            submitLabel="Add event"
            onSubmit={(value) => {
                addEvent(value);
                onClose();
            }}
        />
    );
}
