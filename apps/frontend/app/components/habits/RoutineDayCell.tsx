import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Pause, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { Habit, HabitLog, HabitStatus } from "@cadence/contracts/habit";
import * as Popover from "../primitives/Popover";
import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";
import { isRoutinePaused, routineTone } from "../../lib/utils/habits";
import { formatShortDateLabel } from "../../lib/utils/date-format";
import { RoutineMark } from "./RoutineMark";

const LONG_PRESS_MS = 450;

const SIZE = {
    md: "h-11 w-11",
    sm: "aspect-square w-full max-w-10",
    /** Month grids: grows with its column up to the full 44 px. */
    fit: "aspect-square w-full max-w-11",
} as const;

/** Small cells keep a bigger tap area than they draw, without touching their neighbours. */
const SM_HIT = "before:absolute before:-inset-[3px] before:rounded-full before:content-['']";

/**
 * One routine on one day. Done is the brightest state (filled with the
 * routine's tone); an open past day rests as a dot and shows its ring on hover
 * or focus, so a missed week isn't a wall of empties; days ahead are faint and
 * can't be logged yet. Click/tap toggles done (touch adds Undo); right-click or
 * long-press opens the day menu (Done · Skip · Clear). Keys: Space toggles,
 * S skips, E opens the routine.
 */
export function RoutineDayCell({
    habit,
    date,
    log,
    today,
    size = "md",
    label,
    bloom = true,
    quiet = false,
    tabIndex,
    gridPosition,
    onEdit,
}: {
    habit: Pick<Habit, "id" | "title" | "emoji" | "colorAccent" | "pausedUntil">;
    date: string;
    log?: HabitLog;
    today: string;
    size?: keyof typeof SIZE;
    /** Shown in quiet states instead of the mark (the day number in month grids). */
    label?: ReactNode;
    /** False under low stimulation: no completion bloom. */
    bloom?: boolean;
    /** Month grids: a week with nothing due greys its dates; weeks with something due read brighter. */
    quiet?: boolean;
    tabIndex?: number;
    /** Row/column in a roving-focus grid. */
    gridPosition?: { row: number; col: number };
    onEdit?: () => void;
}) {
    const { mutate: resolve } = useResolveHabit(habit.id);
    const isCoarsePointer = useIsCoarsePointer();
    const [menuOpen, setMenuOpen] = useState(false);
    const [blooming, setBlooming] = useState(false);
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressed = useRef(false);
    useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current); }, []);

    const status = log?.status;
    const dayLabel = formatShortDateLabel(date);
    const style = { "--routine-tone": routineTone(habit.colorAccent) } as CSSProperties;
    const shape = `${SIZE[size]} relative flex shrink-0 items-center justify-center rounded-full`;

    // Not due that day, paused, or not yet reachable: nothing to log.
    if (!log || date > today) {
        const paused = !log && isRoutinePaused(habit, date);
        return (
            <span
                aria-hidden="true"
                style={style}
                className={`${shape} ${log ? "border border-twilight-border/20" : ""} ${label == null ? "text-twilight-text-muted/80" : quiet ? "text-twilight-text-muted/45" : "text-twilight-text-soft"} ${size === "fit" ? "text-xs" : "text-[11px]"} tabular-nums`}
            >
                {label ?? (paused ? <Pause size={11} /> : log ? null : <span className="h-1 w-1 rounded-full bg-twilight-border" />)}
            </span>
        );
    }

    const set = (next: HabitStatus, undoable = isCoarsePointer) => {
        const previous = status ?? "PENDING";
        if (next === previous) return;
        resolve({ targetDate: date, status: next });
        if (next === "COMPLETED" && bloom) setBlooming(true);
        if (!undoable) return;
        toast(next === "COMPLETED" ? "Checked off" : next === "SKIPPED" ? "Skipped" : "Cleared", {
            description: `${habit.title} · ${dayLabel}`,
            action: { label: "Undo", onClick: () => resolve({ targetDate: date, status: previous }) },
        });
    };
    const toggle = () => set(status === "COMPLETED" ? "PENDING" : "COMPLETED");

    const clearPress = () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        pressTimer.current = null;
    };

    const isToday = date === today;
    const state = status === "COMPLETED" ? "done" : status === "SKIPPED" ? "skipped" : isToday ? "open today" : "not logged";
    const look = status === "COMPLETED"
        ? "border border-transparent bg-[color-mix(in_srgb,var(--routine-tone)_80%,transparent)] text-[var(--primary-foreground)]"
        : status === "SKIPPED"
            ? "border border-twilight-border/45 text-twilight-text-muted hover:border-twilight-border"
            : isToday
                ? "border-[1.5px] border-[color-mix(in_srgb,var(--routine-tone)_60%,transparent)] text-[var(--routine-tone)] hover:bg-[color-mix(in_srgb,var(--routine-tone)_10%,transparent)]"
                : "border border-dashed border-transparent text-twilight-text-soft hover:border-twilight-text-muted focus-visible:border-twilight-text-muted";

    return (
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Popover.Anchor asChild>
                <button
                    type="button"
                    style={style}
                    tabIndex={tabIndex}
                    data-cell-row={gridPosition?.row}
                    data-cell-col={gridPosition?.col}
                    data-focus-kind="habit"
                    data-focus-id={habit.id}
                    aria-label={`${habit.title}, ${dayLabel}: ${state}`}
                    aria-pressed={status === "COMPLETED"}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (longPressed.current) {
                            longPressed.current = false;
                            return;
                        }
                        toggle();
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpen(true);
                    }}
                    onPointerDown={(e) => {
                        if (e.pointerType !== "touch") return;
                        e.stopPropagation();
                        longPressed.current = false;
                        pressTimer.current = setTimeout(() => {
                            longPressed.current = true;
                            setMenuOpen(true);
                        }, LONG_PRESS_MS);
                    }}
                    onPointerUp={clearPress}
                    onPointerLeave={clearPress}
                    onPointerCancel={clearPress}
                    onKeyDown={(e) => {
                        if (e.metaKey || e.ctrlKey || e.altKey) return;
                        const key = e.key.toLowerCase();
                        if (key === "s") set(status === "SKIPPED" ? "PENDING" : "SKIPPED", true);
                        else if (key === "e" && onEdit) onEdit();
                        else return;
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onAnimationEnd={() => setBlooming(false)}
                    className={`${shape} ${look} ${blooming ? "routine-bloom" : ""} ${size === "md" ? "touch-target" : SM_HIT} cursor-pointer select-none ${size === "fit" ? "text-xs" : "text-[11px]"} tabular-nums transition-colors [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--routine-tone)] focus-visible:ring-offset-2 focus-visible:ring-offset-twilight-void`}
                >
                    {label != null && (status === "COMPLETED" || status === "SKIPPED") ? (
                        // Month grids keep the date; a small corner mark says done or skipped.
                        <>
                            <span className={status === "COMPLETED" ? "font-semibold" : ""}>{label}</span>
                            <span aria-hidden="true" className={`absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-twilight-void ${status === "COMPLETED" ? "bg-twilight-text text-twilight-void" : "bg-twilight-border text-twilight-text-soft"}`}>
                                {status === "COMPLETED" ? <Check size={9} strokeWidth={3.5} /> : <X size={9} strokeWidth={3} />}
                            </span>
                        </>
                    ) : status === "COMPLETED" ? <Check size={size === "md" ? 18 : 13} strokeWidth={3} aria-hidden="true" />
                        : status === "SKIPPED" ? <X size={size === "md" ? 14 : 11} aria-hidden="true" />
                            : label ?? (isToday ? <RoutineMark emoji={habit.emoji} size={13} /> : <span aria-hidden="true" className="h-1 w-1 rounded-full bg-twilight-text-muted/70" />)}
                </button>
            </Popover.Anchor>
            <Popover.Content side="top" align="center" className="w-auto p-2 [--glass-surface-tint:100%]" aria-label={`${habit.title}, ${dayLabel}`}>
                <p className="px-2 pb-2 pt-1 text-xs font-medium text-twilight-text-soft">{dayLabel}</p>
                <div className="flex gap-1.5">
                    {([
                        ["COMPLETED", "Done", Check],
                        ["SKIPPED", "Skip", X],
                        ["PENDING", "Clear", RotateCcw],
                    ] as const).map(([next, text, Icon]) => (
                        <button
                            key={next}
                            type="button"
                            aria-pressed={(status ?? "PENDING") === next}
                            onClick={() => { set(next, false); setMenuOpen(false); }}
                            className="touch-target flex min-h-11 min-w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 aria-pressed:bg-white/[0.08] aria-pressed:text-twilight-text"
                        >
                            <Icon size={16} aria-hidden="true" />
                            {text}
                        </button>
                    ))}
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}
