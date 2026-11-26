import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const WAKE_EVENT = "cadence:wake";
const TICK_MS = 30_000;
const GAP_MS = 90_000;

export function useWakeRefresh() {
    const queryClient = useQueryClient();

    useEffect(() => {
        let last = Date.now();
        const id = window.setInterval(() => {
            const now = Date.now();
            const slept = now - last > GAP_MS;
            last = now;
            if (!slept) return;
            if (document.visibilityState === "visible") void queryClient.refetchQueries({ type: "active" });
            else void queryClient.invalidateQueries({ type: "active", refetchType: "none" });
            window.dispatchEvent(new Event(WAKE_EVENT));
        }, TICK_MS);
        return () => window.clearInterval(id);
    }, [queryClient]);
}
