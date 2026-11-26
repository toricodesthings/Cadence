import { useState, useEffect } from "react";

export function useMinuteClock(): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(id);
    }, []);
    return now;
}
