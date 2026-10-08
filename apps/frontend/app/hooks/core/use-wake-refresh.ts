import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const WAKE_EVENT = "cadence:wake";
const TICK_MS = 30_000;
const GAP_MS = 90_000;

/**
 * After sleep the page may wake with no focus or visibility change (the desktop app waiting in the
 * tray), so nothing would refresh. A timer that fires far later than scheduled means the computer
 * slept: refetch what's on screen and tell the zone/reminder syncs to recheck.
 */
export function useWakeRefresh() {
    const queryClient = useQueryClient();

    useEffect(() => {
        let last = Date.now();
        const id = window.setInterval(() => {
            const now = Date.now();
            const slept = now - last > GAP_MS;
            last = now;
            if (!slept) return;
            void queryClient.refetchQueries({ type: "active" });
            window.dispatchEvent(new Event(WAKE_EVENT));
        }, TICK_MS);
        return () => window.clearInterval(id);
    }, [queryClient]);
}
