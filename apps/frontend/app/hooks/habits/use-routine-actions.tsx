import type { LocalDate } from "@cadence/domain/time";
import type { Habit } from "@cadence/contracts/habit";
import { isRoutinePaused } from "../../lib/utils/habits";
import { useDeleteHabit } from "./use-delete-habit";
import { useUpdateHabit } from "./use-update-habit";
import { usePauseHabit, useResumeHabit } from "./use-pause-habit";

/**
 * Everything a routine's menus and editor can do to it. `onGone` runs after an
 * archive, a restore or a delete (an open editor closes).
 */
export function useRoutineActions(habit: Habit, { onGone }: { onGone?: () => void } = {}) {
    const { mutate: updateHabit } = useUpdateHabit();
    const { mutate: deleteHabit } = useDeleteHabit();
    const { pause } = usePauseHabit();
    const { resume } = useResumeHabit();

    return {
        isPaused: isRoutinePaused(habit),
        /** Pause from today until `until` (a LocalDate), a week by default. */
        pause: (until?: LocalDate) => pause(habit.id, until),
        resume: () => resume(habit.id),
        toggleArchive: () => {
            updateHabit({ id: habit.id, archived: !habit.archived });
            onGone?.(); // it leaves the list being shown
        },
        /** Gone at once, with an Undo toast; the delete is only sent once that window closes. */
        requestDelete: () => { deleteHabit({ id: habit.id, name: habit.title }); onGone?.(); },
    };
}
