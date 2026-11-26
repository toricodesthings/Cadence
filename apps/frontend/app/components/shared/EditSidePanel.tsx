import { lazy } from "react";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { Habit } from "@cadence/contracts/habit";
import type { LocalDate } from "@cadence/domain/time";
import type { PersonalEvent, SharedEvent } from "@cadence/contracts/personal-event";
import { DetailPanelSkeleton } from "./DetailPanelSkeleton";
import { StartupSuspense } from "./StartupSuspense";

const ClarifySheet = lazy(() => import("../holding/ClarifySheet").then((m) => ({ default: m.ClarifySheet })));
const TaskEditor = lazy(() => import("../tasks/TaskEditor").then((m) => ({ default: m.TaskEditor })));
const HabitEditor = lazy(() => import("../habits/HabitEditor").then((m) => ({ default: m.HabitEditor })));
const CheeringPanel = lazy(() => import("../habits/CheeringPanel").then((m) => ({ default: m.CheeringPanel })));
const PersonalEventEditor = lazy(() =>
    import("../events/PersonalEventEditor").then((m) => ({ default: m.PersonalEventEditor })),
);

type EditorProps = {
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
} & (
    | { kind: "capture"; item: InboxItem; onOpenFullEditor?: (taskId: string) => void }
    | { kind: "task"; taskId: string }
    | {
          kind: "habit";
          habit: Habit;
          day?: LocalDate;
          onOpenInRoutines?: () => void;
      }
    | {
          kind: "event";
          event: SharedEvent;
          onChange: (patch: Partial<Omit<PersonalEvent, "id">>) => void;
          onShare?: () => void;
          onDelete: () => void;
          onRemoveFromMyEvents?: () => void;
      }
);

export function EditSidePanel(props: EditorProps) {
    return (
        <StartupSuspense fallback={<DetailPanelSkeleton kind={props.kind} />}>
            <Editor {...props} />
        </StartupSuspense>
    );
}

function Editor(props: EditorProps) {
    switch (props.kind) {
        case "capture":
            return <ClarifySheet key={props.item.id} {...props} />;
        case "task":
            return <TaskEditor key={props.taskId} {...props} />;
        case "habit":
            return props.habit.access === "view" ? (
                <CheeringPanel key={props.habit.id} {...props} />
            ) : (
                <HabitEditor key={props.habit.id} {...props} />
            );
        case "event":
            return <PersonalEventEditor key={props.event.id} {...props} />;
    }
}
