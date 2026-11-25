import { WeekView } from "../WeekView";
import { StepShell } from "../StepShell";
import type { useWeekRoom } from "../../../hooks/core/use-week-room";

/* ─── Step 5 · Your week: the next 7 days, each opening its own view here (Done finishes) ─── */
export function ReadyStep({
    room,
    onOpenTask,
    onOpenRoutine,
    titleInHeader,
}: {
    room: ReturnType<typeof useWeekRoom>["room"];
    onOpenTask: (id: string) => void;
    onOpenRoutine: (id: string) => void;
    titleInHeader?: boolean;
}) {
    return (
        <StepShell step={5} titleInHeader={titleInHeader}>
            <WeekView room={room} onOpenTask={onOpenTask} onOpenRoutine={onOpenRoutine} />
        </StepShell>
    );
}
