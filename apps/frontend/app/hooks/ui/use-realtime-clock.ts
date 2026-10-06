import { useState, useEffect } from "react";
import { formatTime } from "../../lib/utils/date-format";

/** Returns a live time string that updates every second, respecting format settings */
export function useRealtimeClock(): string {
    const fmt = () => formatTime(new Date().toISOString()); // the user's zone, their 12h/24h setting

    const [time, setTime] = useState(fmt);

    useEffect(() => {
        const id = setInterval(() => setTime(fmt()), 1_000);
        return () => clearInterval(id);
    }, []);

    return time;
}

/** The current time, refreshed once a minute: enough for "now" lines and "in 48m". */
export function useMinuteClock(): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(id);
    }, []);
    return now;
}
