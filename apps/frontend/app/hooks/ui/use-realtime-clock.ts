import { useState, useEffect } from "react";
import { getDateFormatConfig } from "../../lib/utils/date-format";

/** Returns a live time string that updates every second, respecting format settings */
export function useRealtimeClock(): string {
    const fmt = () => {
        const is24h = getDateFormatConfig().timeDisplay === "24h";
        return new Date().toLocaleTimeString(is24h ? "en-GB" : "en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: !is24h,
        });
    };

    const [time, setTime] = useState(fmt);

    useEffect(() => {
        const id = setInterval(() => setTime(fmt()), 1_000);
        return () => clearInterval(id);
    }, []);

    return time;
}
