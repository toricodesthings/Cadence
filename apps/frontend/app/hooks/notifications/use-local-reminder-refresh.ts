import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { todayIn } from "@cadence/domain/time";
import { queryKeys } from "../../lib/api/query-keys";
import { getWalSnapshot } from "../../lib/api/offline-wal";
import { getUserZone } from "../../lib/utils/user-zone";

/** How often a device that alerts by itself re-reads what its reminders come from. */
export const LOCAL_REFRESH_MS = 2 * 60_000;

/**
 * A device that alerts by itself (the desktop app, in the tray too; a browser without push) only knows
 * what it last fetched, and a hidden window never gets a focus refetch. Every couple of minutes it
 * re-reads exactly what its reminders derive from — open and waiting tasks, today's routines, settings,
 * dismissals and devices — so a dose logged or a task moved on the phone doesn't alert here.
 * Skipped while writes are queued or in flight: a refetch then would briefly undo them on screen.
 */
export function useLocalReminderRefresh(active: boolean, userId: string | undefined) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!active || !userId) return;
        const id = window.setInterval(() => {
            if (queryClient.isMutating() > 0 || getWalSnapshot().some((entry) => entry.status !== "failed")) return;
            const today = todayIn(getUserZone());
            void Promise.all([
                queryClient.refetchQueries({ queryKey: queryKeys.tasks.list({ state: "ACTIVE" }), exact: true, type: "active" }),
                queryClient.refetchQueries({ queryKey: queryKeys.tasks.list({ state: "WAITING" }), exact: true, type: "active" }),
                queryClient.refetchQueries({ queryKey: queryKeys.habits.weekly({ start: today, end: today }), type: "active" }),
                // Settings, notification state and the device list all sit under the account's settings key.
                queryClient.refetchQueries({ queryKey: ["settings", userId], type: "active" }),
            ]);
        }, LOCAL_REFRESH_MS);
        return () => window.clearInterval(id);
    }, [active, userId, queryClient]);
}
