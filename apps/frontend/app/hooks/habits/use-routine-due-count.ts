import { useHabitsWeekly } from "./use-habits";
import { useSettings } from "../core/use-settings";
import { useMinuteClock } from "../ui/use-realtime-clock";
import { toISODate } from "../../lib/utils/date-format";

/** One count for every navigation surface, scoped to today's scheduled instances. */
export function useRoutineDueCount() {
    const today = toISODate(useMinuteClock());
    const { data: settings } = useSettings();
    const enabled = settings?.notifications?.showHabitNavDueCount !== false;
    const { data: routines = [] } = useHabitsWeekly({ start: today, end: today, enabled });
    if (!enabled) return 0;
    return routines.filter((routine) => routine.logs?.some(
        (log) => log.targetDate.slice(0, 10) === today && log.status === "PENDING",
    )).length;
}
