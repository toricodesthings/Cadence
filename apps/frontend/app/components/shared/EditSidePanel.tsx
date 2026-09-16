import type { InboxItem } from "@cadence/contracts/inbox";
import { ClarifySheet } from "../holding/ClarifySheet";
import type { Habit } from "@cadence/contracts/habit";
import type { PersonalEvent } from "../../types/settings";
import { TaskEditor } from "../tasks/TaskEditor";
import { HabitEditor } from "../habits/HabitEditor";
import { PersonalEventEditor } from "../events/PersonalEventEditor";

type EditorProps = {
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
} & (
    | { kind: "capture"; item: InboxItem; onOpenFullEditor?: (taskId: string) => void }
    | { kind: "task"; taskId: string }
    | { kind: "habit"; habit: Habit }
    | { kind: "event"; event: PersonalEvent; onChange: (patch: Partial<Omit<PersonalEvent, "id">>) => void; onDelete: () => void }
);

/** The shared entry point for inspecting and editing app entities. */
export function EditSidePanel(props: EditorProps) {
    switch (props.kind) {
        case "capture": return <ClarifySheet key={props.item.id} {...props} />;
        case "task": return <TaskEditor key={props.taskId} {...props} />;
        case "habit": return <HabitEditor key={props.habit.id} {...props} />;
        case "event": return <PersonalEventEditor key={props.event.id} {...props} />;
    }
}
