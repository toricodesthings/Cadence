import { lazy } from "react";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { Habit } from "@cadence/contracts/habit";
import type { PersonalEvent } from "../../types/settings";
import { StartupSuspense } from "./StartupSuspense";

// Editors load on first selection, never with the first screen (a deep link still waits for its editor).
const ClarifySheet = lazy(() => import("../holding/ClarifySheet").then((m) => ({ default: m.ClarifySheet })));
const TaskEditor = lazy(() => import("../tasks/TaskEditor").then((m) => ({ default: m.TaskEditor })));
const HabitEditor = lazy(() => import("../habits/HabitEditor").then((m) => ({ default: m.HabitEditor })));
const PersonalEventEditor = lazy(() => import("../events/PersonalEventEditor").then((m) => ({ default: m.PersonalEventEditor })));

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
    return <StartupSuspense fallback={null}><Editor {...props} /></StartupSuspense>;
}

function Editor(props: EditorProps) {
    switch (props.kind) {
        case "capture": return <ClarifySheet key={props.item.id} {...props} />;
        case "task": return <TaskEditor key={props.taskId} {...props} />;
        case "habit": return <HabitEditor key={props.habit.id} {...props} />;
        case "event": return <PersonalEventEditor key={props.event.id} {...props} />;
    }
}
