import { useState, useEffect } from "react";

/** Returns a live HH:MM string that updates every second */
export function useRealtimeClock(): string {
    const fmt = () =>
        new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });

    const [time, setTime] = useState(fmt);

    useEffect(() => {
        const id = setInterval(() => setTime(fmt()), 1_000);
        return () => clearInterval(id);
    }, []);

    return time;
}
