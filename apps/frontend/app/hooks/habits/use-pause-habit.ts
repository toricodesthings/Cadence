import { useCallback } from "react";
import { useUpdateHabit } from "./use-update-habit";
import { addDays, format } from "date-fns";

/** Pause a habit until a given date (or default 7 days from today). */
export function usePauseHabit() {
    const { mutate, ...rest } = useUpdateHabit();

    const pause = useCallback(
        (habitId: string, until?: Date) => {
            const pauseDate = until ?? addDays(new Date(), 7);
            mutate({ id: habitId, pausedUntil: format(pauseDate, "yyyy-MM-dd") });
        },
        [mutate],
    );

    return { pause, ...rest };
}

/** Resume a paused habit immediately by clearing pausedUntil. */
export function useResumeHabit() {
    const { mutate, ...rest } = useUpdateHabit();

    const resume = useCallback(
        (habitId: string) => {
            mutate({ id: habitId, pausedUntil: null });
        },
        [mutate],
    );

    return { resume, ...rest };
}
