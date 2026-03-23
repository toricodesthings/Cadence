import { useEffect, useState } from "react";
import { HOUR_HEIGHT } from "../../lib/utils/calendar/calendar-utils";

function getNowTop() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    return (minutes / 60) * HOUR_HEIGHT;
}

export function CurrentTimeIndicator() {
    const [top, setTop] = useState(() => getNowTop());

    useEffect(() => {
        const tick = () => setTop(getNowTop());
        tick();

        const intervalId = window.setInterval(() => {
            window.requestAnimationFrame(tick);
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, []);

    return (
        <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top }} aria-hidden="true">
            <div className="flex items-center gap-0">
                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-lantern shadow-[0_0_8px_var(--color-lantern),0_0_18px_var(--color-lantern)]" />
                <div className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-lantern/60 shadow-[0_0_6px_var(--color-lantern)]">
                    <div className="cadence-now-line-sheen absolute inset-y-[-4px] w-20 rounded-full" />
                </div>
            </div>
        </div>
    );
}