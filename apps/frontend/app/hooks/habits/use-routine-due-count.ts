import { useHabitsRange } from "./use-habits";
import { useSettings } from "../core/use-settings";
import { useToday } from "../../lib/utils/user-zone";

/** One count for every navigation surface, scoped to today's scheduled instances. */
export function useRoutineDueCount() {
    const today = useToday();
    const { data: settings } = useSettings();
    const enabled = settings?.notifications?.showHabitNavDueCount !== false;
    const { data: routines = [] } = useHabitsRange({ start: today, end: today, enabled });
    if (!enabled) return 0;
    return routines.filter((routine) => routine.logs?.some(
        (log) => log.targetDate === today && log.status === "PENDING",
    )).length;
}
