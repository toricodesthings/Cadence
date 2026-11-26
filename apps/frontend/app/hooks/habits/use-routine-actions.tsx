import type { LocalDate } from "@cadence/domain/time";
import type { Habit } from "@cadence/contracts/habit";
import { isRoutinePaused } from "../../lib/utils/habits";
import { useDeleteHabit } from "./use-delete-habit";
import { useUpdateHabit } from "./use-update-habit";
import { usePauseHabit, useResumeHabit } from "./use-pause-habit";

export function useRoutineActions(habit: Habit, { onGone }: { onGone?: () => void } = {}) {
    const { mutate: updateHabit } = useUpdateHabit();
    const { mutate: deleteHabit } = useDeleteHabit();
    const { pause } = usePauseHabit();
    const { resume } = useResumeHabit();

    return {
        isPaused: isRoutinePaused(habit),
        pause: (until?: LocalDate) => pause(habit.id, until),
        resume: () => resume(habit.id),
        toggleArchive: () => {
            updateHabit({ id: habit.id, archived: !habit.archived });
            onGone?.();
        },
        requestDelete: () => {
            deleteHabit({ id: habit.id, name: habit.title });
            onGone?.();
        },
    };
}
