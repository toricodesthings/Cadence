import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HOUR_HEIGHT } from "../../lib/utils/calendar/calendar-utils";

function getNowTop() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    return (minutes / 60) * HOUR_HEIGHT;
}

// One shared 15s clock for every chip that asks whether the now-line crosses it.
const NOW_STEP_MS = 15_000;
const subscribeNow = (onChange: () => void) => {
    const id = window.setInterval(onChange, NOW_STEP_MS);
    return () => window.clearInterval(id);
};
const getNowBucket = () => Math.floor(Date.now() / NOW_STEP_MS) * NOW_STEP_MS;

/** True while the current-time line sits inside [start, end). */
export function useIsUnderNowLine(start?: string | null, end?: string | null, enabled = true) {
    const now = useSyncExternalStore(enabled ? subscribeNow : noopSubscribe, getNowBucket, () => 0);
    if (!enabled || !start || !end) return false;
    return new Date(start).getTime() <= now && now < new Date(end).getTime();
}
const noopSubscribe = () => () => {};

/** Pins the now-line sheen animations under `el` to the document's time origin, so the
 *  line and every chip it crosses run in phase no matter when each mounted. */
export function syncNowSheen(el: Element | null) {
    el?.getAnimations({ subtree: true }).forEach((a) => {
        if (a instanceof CSSAnimation && a.animationName.startsWith("cadence-now-")) a.startTime = 0;
    });
}

export function CurrentTimeIndicator() {
    const [top, setTop] = useState(() => getNowTop());
    const sheenRef = useRef<HTMLDivElement>(null);

    useEffect(() => syncNowSheen(sheenRef.current), []);

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
                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-primary shadow-[0_0_8px_var(--accent-primary),0_0_18px_var(--accent-primary)]" />
                <div className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-accent-primary/60 shadow-[0_0_6px_var(--accent-primary)]">
                    <div ref={sheenRef} className="cadence-now-line-sheen absolute inset-y-[-4px] w-20 rounded-full" />
                </div>
            </div>
        </div>
    );
}