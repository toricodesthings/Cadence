import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { RoutineMark } from "../habits/RoutineMark";
import { formatTime } from "../../lib/utils/date-format";

export interface SpineItem {
    id: string;
    kind: "fixed" | "routine";
    title: string;
    start: Date;
    /** Fixed blocks have an end; a timed routine is a moment. */
    end: Date | null;
    emoji?: string | null;
    done?: boolean;
}

const STORAGE_KEY = "cadence-today-spine-collapsed";

function readCollapsed() {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

function writeCollapsed(value: boolean) {
    try {
        window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
        // Per-viewer convenience only; the spine still works without it.
    }
}

function useMinuteClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(id);
    }, []);
    return now;
}

function formatIn(ms: number) {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
}

/**
 * Where you need to be today. Fixed blocks (and timed routines, as small marks)
 * laid out in time order: past ones fade, the current one reads "now", and the
 * next one says how long until it starts. Nothing here is checked off.
 */
export function DaySpine({ items, onOpen }: { items: SpineItem[]; onOpen: (item: SpineItem) => void }) {
    const now = useMinuteClock();
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => setCollapsed(readCollapsed()), []);

    const sorted = useMemo(() => [...items].sort((a, b) => a.start.getTime() - b.start.getTime()), [items]);
    const fixed = sorted.filter((item) => item.kind === "fixed");
    const current = fixed.find((item) => item.start <= now && item.end && item.end > now) ?? null;
    const next = fixed.find((item) => item.start > now) ?? null;

    if (fixed.length === 0) return null;

    const summary = current
        ? `Now: ${current.title} · until ${formatTime(current.end!.toISOString())}`
        : next
            ? `Next: ${next.title} · ${formatTime(next.start.toISOString())} (${formatIn(next.start.getTime() - now.getTime())})`
            : "Nothing else fixed today";

    const toggle = () => {
        setCollapsed((value) => {
            writeCollapsed(!value);
            return !value;
        });
    };

    // The "now" marker sits between the last started item and the first upcoming one.
    const nowIndex = sorted.findIndex((item) => item.start > now);

    return (
        <section aria-label="Fixed today" className="mb-4 rounded-[24px] border border-moonlit/15 bg-moonlit/[0.05] px-3 py-2.5">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={!collapsed}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-2xl px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                <CalendarClock size={16} className="shrink-0 text-moonlit" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-twilight-text">{summary}</span>
                <span className="shrink-0 text-[12px] text-twilight-text-soft">{fixed.length} fixed</span>
                <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-twilight-text-soft transition-transform ${collapsed ? "" : "rotate-180"}`} />
            </button>

            {collapsed ? null : (
                <ol className="mt-1 flex gap-2 overflow-x-auto px-1 pb-1.5 pt-1 scrollbar-thin">
                    {sorted.map((item, index) => {
                        const isPast = (item.end ?? item.start) <= now && item !== current;
                        const isCurrent = item === current;
                        const markerBefore = index === nowIndex;
                        const markerAfter = nowIndex === -1 && index === sorted.length - 1;
                        const time = formatTime(item.start.toISOString());
                        return (
                            <li key={item.id} className="flex shrink-0 items-center gap-2">
                                {markerBefore ? <NowMarker now={now} /> : null}
                                {item.kind === "fixed" ? (
                                    <button
                                        type="button"
                                        onClick={() => onOpen(item)}
                                        aria-label={`${item.title}, ${time}${item.end ? ` to ${formatTime(item.end.toISOString())}` : ""}${isCurrent ? ", happening now" : ""}`}
                                        className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-2xl border px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                            isCurrent
                                                ? "border-moonlit/45 bg-moonlit/15"
                                                : "border-moonlit/20 bg-white/[0.03] hover:bg-white/[0.06]"
                                        } ${isPast ? "opacity-50" : ""}`}
                                    >
                                        <span className="text-[11px] tabular-nums text-moonlit">
                                            {isCurrent ? "Now" : time}
                                            {item.end ? ` – ${formatTime(item.end.toISOString())}` : ""}
                                        </span>
                                        <span className="max-w-[14rem] truncate text-[13px] font-medium text-twilight-text">{item.title}</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onOpen(item)}
                                        aria-label={`Routine ${item.title} at ${time}${item.done ? ", done" : ""}`}
                                        className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[12px] text-twilight-text-soft transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${isPast || item.done ? "opacity-50" : ""}`}
                                    >
                                        <RoutineMark emoji={item.emoji} size={11} className="text-moonlit" />
                                        <span className="tabular-nums">{time}</span>
                                        <span className="max-w-[8rem] truncate">{item.title}</span>
                                    </button>
                                )}
                                {markerAfter ? <NowMarker now={now} /> : null}
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}

function NowMarker({ now }: { now: Date }) {
    return (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium tabular-nums text-accent-primary" aria-label={`Now, ${formatTime(now.toISOString())}`}>
            <span className="h-2 w-2 rounded-full bg-accent-primary" aria-hidden="true" />
            <span aria-hidden="true">{formatTime(now.toISOString())}</span>
        </span>
    );
}
