import { useCallback } from "react";
import { useUpdateHabit } from "./use-update-habit";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { today } from "../../lib/utils/user-zone";

/** Pause a habit from today through `until` (inclusive), a week by default. */
export function usePauseHabit() {
    const { mutate, ...rest } = useUpdateHabit();

    const pause = useCallback(
        (habitId: string, until?: LocalDate) => {
            mutate({ id: habitId, pausedUntil: until ?? addDays(today(), 6) });
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
