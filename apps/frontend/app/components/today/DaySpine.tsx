import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { Reveal } from "../shared/Reveal";
import { formatTime } from "../../lib/utils/date-format";
import { formatDuration } from "../../lib/utils/calendar/schedule-day";
import { useMinuteClock } from "../../hooks/ui/use-realtime-clock";

export interface SpineItem {
    id: string;
    title: string;
    start: Date;
    /** Fixed blocks may have no end. */
    end: Date | null;
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

function formatIn(ms: number) {
    return `in ${formatDuration(Math.max(1, Math.round(ms / 60_000)))}`;
}

/** Sorted blocks, the one happening now, the next one, and the one-line summary. */
export function useSpine(items: SpineItem[]) {
    const now = useMinuteClock();
    const sorted = useMemo(() => [...items].sort((a, b) => a.start.getTime() - b.start.getTime()), [items]);
    const current = sorted.find((item) => item.start <= now && item.end && item.end > now) ?? null;
    const next = sorted.find((item) => item.start > now) ?? null;
    const summary = current
        ? `Now: ${current.title} · until ${formatTime(current.end!.toISOString())}`
        : next
            ? `Next: ${next.title} · ${formatTime(next.start.toISOString())} (${formatIn(next.start.getTime() - now.getTime())})`
            : "Nothing else fixed today";
    return { now, sorted, current, next, summary };
}

/**
 * Where you need to be today. Fixed blocks only, laid out in time order: past ones fade,
 * the current one reads "now", and the next one says how long until it starts. Nothing here is checked off.
 * List view shows it as a strip; board view as the Fixed column (`SpineTimeline`).
 */
export function DaySpine({ items, onOpen }: { items: SpineItem[]; onOpen: (item: SpineItem) => void }) {
    const { now, sorted, current, summary } = useSpine(items);
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => setCollapsed(readCollapsed()), []);

    if (sorted.length === 0) return null;

    const toggle = () => {
        setCollapsed((value) => {
            writeCollapsed(!value);
            return !value;
        });
    };

    // The "now" marker sits between the last started item and the first upcoming one.
    const nowIndex = sorted.findIndex((item) => item.start > now);

    return (
        <section aria-label="Fixed today" className="surface-card mb-4 rounded-[24px] px-3 py-2.5">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={!collapsed}
                aria-controls="day-spine-list"
                className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-2xl px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                <CalendarClock size={16} className="shrink-0 text-moonlit" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-twilight-text">{summary}</span>
                <span className="shrink-0 text-[12px] text-twilight-text-soft">{sorted.length} fixed</span>
                <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-twilight-text-soft transition-transform ${collapsed ? "" : "rotate-180"}`} />
            </button>

            <Reveal open={!collapsed} id="day-spine-list">
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
                                <button
                                    type="button"
                                    onClick={() => onOpen(item)}
                                    aria-label={`${item.title}, ${time}${item.end ? ` to ${formatTime(item.end.toISOString())}` : ""}${isCurrent ? ", happening now" : ""}`}
                                    className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-2xl border px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                        isCurrent
                                            ? "border-moonlit/45 bg-moonlit/15"
                                            : "surface-item border-moonlit/20 hover:bg-white/[0.06]"
                                    } ${isPast ? "opacity-50" : ""}`}
                                >
                                    <span className="text-[11px] tabular-nums text-moonlit">
                                        {isCurrent ? "Now" : time}
                                        {item.end ? ` – ${formatTime(item.end.toISOString())}` : ""}
                                    </span>
                                    <span className="max-w-[14rem] truncate text-[13px] font-medium text-twilight-text">{item.title}</span>
                                </button>
                                {markerAfter ? <NowMarker now={now} /> : null}
                            </li>
                        );
                    })}
                </ol>
            </Reveal>
        </section>
    );
}

/** The live now/next line, used as the Fixed column's description. */
export function SpineSummary({ items }: { items: SpineItem[] }) {
    return <>{useSpine(items).summary}</>;
}

/** Board view: the same blocks as a vertical timeline (time left, block right, a now line between past and next). */
export function SpineTimeline({ items, onOpen }: { items: SpineItem[]; onOpen: (item: SpineItem) => void }) {
    const { now, sorted, current } = useSpine(items);
    const nowIndex = sorted.findIndex((item) => item.start > now);

    return (
        <ol className="flex flex-col gap-1.5">
            {sorted.map((item, index) => {
                const isPast = (item.end ?? item.start) <= now && item !== current;
                const isCurrent = item === current;
                const time = formatTime(item.start.toISOString());
                return (
                    <li key={item.id} className="flex flex-col gap-1.5">
                        {index === nowIndex ? <NowLine now={now} /> : null}
                        <div className={`flex items-stretch gap-3 ${isPast ? "opacity-50" : ""}`}>
                            <span className="w-[4.5rem] shrink-0 whitespace-nowrap pt-2.5 text-right text-[12px] tabular-nums text-moonlit">{isCurrent ? "Now" : time}</span>
                            <button
                                type="button"
                                onClick={() => onOpen(item)}
                                aria-label={`${item.title}, ${time}${item.end ? ` to ${formatTime(item.end.toISOString())}` : ""}${isCurrent ? ", happening now" : ""}`}
                                className={`flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center rounded-2xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                    isCurrent ? "border-moonlit/45 bg-moonlit/15" : "surface-item border-moonlit/20 hover:bg-white/[0.06]"
                                }`}
                            >
                                <span className="truncate text-[13px] font-medium text-twilight-text">{item.title}</span>
                                {item.end ? <span className="text-[11px] tabular-nums text-twilight-text-soft">{time} – {formatTime(item.end.toISOString())}</span> : null}
                            </button>
                        </div>
                        {index === sorted.length - 1 && nowIndex === -1 ? <NowLine now={now} /> : null}
                    </li>
                );
            })}
        </ol>
    );
}

function NowLine({ now }: { now: Date }) {
    return (
        <div className="flex items-center gap-2 text-[11px] font-medium tabular-nums text-accent-primary" role="separator" aria-label={`Now, ${formatTime(now.toISOString())}`}>
            <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-right" aria-hidden="true">{formatTime(now.toISOString())}</span>
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent-primary" aria-hidden="true" />
            <span className="h-px flex-1 bg-accent-primary/50" aria-hidden="true" />
        </div>
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
