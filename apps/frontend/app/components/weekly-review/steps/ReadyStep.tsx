import { WeekView } from "../WeekView";
import { StepShell } from "../StepShell";
import { WeekRoomSkeleton } from "../WeeklyReviewSkeleton";
import type { useWeekRoom } from "../../../hooks/core/use-week-room";

export function ReadyStep({
    room,
    isLoading,
    onOpenTask,
    onOpenRoutine,
    titleInHeader,
}: {
    room: ReturnType<typeof useWeekRoom>["room"];
    isLoading?: boolean;
    onOpenTask: (id: string) => void;
    onOpenRoutine: (id: string) => void;
    titleInHeader?: boolean;
}) {
    return (
        <StepShell step={5} titleInHeader={titleInHeader}>
            {isLoading ? (
                <WeekRoomSkeleton />
            ) : (
                <WeekView room={room} onOpenTask={onOpenTask} onOpenRoutine={onOpenRoutine} />
            )}
        </StepShell>
    );
}
