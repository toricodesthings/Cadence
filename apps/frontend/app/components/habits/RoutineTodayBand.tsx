import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import { formatTime } from "../../lib/utils/date-format";
import { RoutineAgendaList, routineAgendaItems } from "../shared/RoutineAgendaRow";

const COLLAPSED_KEY = "cadence-routines-today-collapsed";

function readCollapsed() {
    try {
        return window.localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
        return false;
    }
}

/** A ring filling as today's routines are checked off, the count inside. `still` = no fill motion (low stimulation). */
function ProgressRing({ done, total, still }: { done: number; total: number; still: boolean }) {
    const radius = 19;
    const length = 2 * Math.PI * radius;
    return (
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
            <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="absolute inset-0 -rotate-90">
                <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4" className="stroke-moonlit/15" />
                <circle
                    cx="22"
                    cy="22"
                    r={radius}
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={length}
                    strokeDashoffset={length * (1 - (total ? done / total : 0))}
                    className={`stroke-moonlit ${still ? "" : "transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"}`}
                />
            </svg>
            <span className="text-xs font-semibold tabular-nums text-twilight-text">{done}/{total}</span>
        </span>
    );
}

/**
 * The easy way to check in: today's routines as one-tap rows (the same rows as
 * Today), done ones folded, beside a ring with the count; side by side on wide
 * screens. Same surface as Today's routine section. Collapsing is remembered on this device.
 */
export function RoutineTodayBand({ habits, today, bloom, columns, onOpen }: {
    habits: Habit[];
    today: string;
    bloom: boolean;
    /** Wide screens: rows side by side across the full width. */
    columns: boolean;
    onOpen: (habitId: string) => void;
}) {
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const { mutateAsync: resolve } = useResolveHabit();
    const items = routineAgendaItems(habits, today);
    if (!items.length) return null;
    const done = items.filter((item) => item.done).length;
    const next = items.find((item) => !item.done && item.time);
    const line = done === items.length
        ? "All done for today"
        : next ? `Next at ${formatTime(`${today}T${next.time}:00`)} · ${next.title}` : `${items.length - done} left, any time today`;

    const toggle = () => setCollapsed((current) => {
        try {
            window.localStorage.setItem(COLLAPSED_KEY, current ? "0" : "1");
        } catch {
            // Per-device convenience only.
        }
        return !current;
    });

    return (
        <section aria-label="Today's routines" className="mb-4 rounded-[28px] border border-moonlit/15 bg-moonlit/[0.05] px-2 py-2">
            <div className="flex min-h-14 items-center gap-3 px-2">
                <ProgressRing done={done} total={items.length} still={!bloom} />
                <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-semibold text-twilight-text">Today</span>
                    <span className="block truncate text-xs text-twilight-text-soft">{line}</span>
                </span>
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? "Show today's routines" : "Hide today's routines"}
                    className="btn-icon cursor-pointer rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                >
                    <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${collapsed ? "" : "rotate-180"}`} />
                </button>
            </div>
            {collapsed ? null : (
                <div className="pt-1">
                    <RoutineAgendaList
                        items={items}
                        day={today}
                        animate={bloom}
                        columns={columns}
                        onOpen={onOpen}
                        onComplete={(item) => resolve({ habitId: item.habitId, targetDate: today, status: item.done ? "PENDING" : "COMPLETED" })}
                    />
                </div>
            )}
        </section>
    );
}
