import { useHabitsRange } from "./use-habits";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { useToday } from "../../lib/utils/user-zone";

export function useRoutineDueCount() {
    const today = useToday();
    const { session } = useAuthState();
    const me = session?.user.id;
    const { data: settings } = useSettings();
    const enabled = settings?.notifications?.showHabitNavDueCount !== false;
    const { data: routines = [] } = useHabitsRange({ start: today, end: today, enabled });
    if (!enabled) return 0;
    return routines.filter((routine) => {
        if (routine.access === "view") return false;
        if (routine.pausedUntil && routine.pausedUntil >= today) return false;
        if (routine.shareMode === "turns" && me && routine.today?.turn && routine.today.turn !== me) return false;
        return routine.logs?.some((log) => log.targetDate === today && log.status === "PENDING");
    }).length;
}
