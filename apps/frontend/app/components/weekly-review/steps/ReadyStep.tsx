import { WeekView } from "../WeekView";
import { StepShell } from "../StepShell";
import type { useWeekRoom } from "../../../hooks/core/use-week-room";

/* ─── Step 5 · Your week: the next 7 days, each opening its own view here (Done finishes) ─── */
export function ReadyStep({ room, onOpenTask, onOpenRoutine, onTitleVisible }: {
    room: ReturnType<typeof useWeekRoom>["room"];
    onOpenTask: (id: string) => void;
    onOpenRoutine: (id: string) => void;
    onTitleVisible?: (visible: boolean) => void;
}) {
    return (
        <StepShell step={5} onTitleVisible={onTitleVisible}>
            <WeekView room={room} onOpenTask={onOpenTask} onOpenRoutine={onOpenRoutine} />
        </StepShell>
    );
}
