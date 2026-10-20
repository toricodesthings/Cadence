import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Pause, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import type { Habit, HabitLog, HabitStatus } from "@cadence/contracts/habit";
import * as Popover from "../primitives/Popover";
import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { isRoutinePaused, routineTone } from "../../lib/utils/habits";
import { formatShortDateLabel } from "../../lib/utils/date-format";
import { RoutineMark } from "./RoutineMark";
import { RoutineStepChecklist, stepProgress } from "./RoutineSteps";
import { RoutineTimeChecklist } from "./RoutineTimes";
import { timeMarksOn, timeProgress } from "@cadence/domain/repeats";

const LONG_PRESS_MS = 450;
/** Pointer hover on a routine at set times: a beat before opening, and grace to cross into the card. */
const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 200;

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
 * long-press opens the day menu (Done · Skip · Clear, then the steps one by one
 * when the routine has them). A partly done day shows "2/3" (the date in month
 * grids) in the open look. A routine at set times opens its time checklist
 * instead (a mouse just hovers it): a whole-day tap would otherwise check off times that haven't come. Keys: Space toggles, S skips, E opens the routine.
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
    habit: Pick<Habit, "id" | "title" | "emoji" | "colorAccent" | "pausedUntil" | "steps" | "times">;
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
    const { isTouch } = useShellMode();
    const [menuOpen, setMenuOpen] = useState(false);
    const [blooming, setBlooming] = useState(false);
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressed = useRef(false);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openedByHover = useRef(false);
    useEffect(() => () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
    }, []);

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

    const timed = Boolean(habit.times?.length);
    const set = (next: HabitStatus, undoable = isTouch) => {
        if (timed) return setMenuOpen(true);
        const previous = status ?? "PENDING";
        if (next === previous && (next !== "PENDING" || !log.stepStatus)) return; // clearing still drops a partly done day's steps
        const previousSteps = log.stepStatus ?? undefined;
        resolve({ targetDate: date, status: next });
        if (next === "COMPLETED" && bloom) setBlooming(true);
        if (!undoable) return;
        toast.message(next === "COMPLETED" ? "Checked off" : next === "SKIPPED" ? "Skipped" : "Cleared", {
            description: `${habit.title} · ${dayLabel}`,
            action: { label: "Undo", onClick: () => resolve({ targetDate: date, status: previous, stepStatus: previousSteps }) },
        });
    };
    const toggle = () => set(status === "COMPLETED" ? "PENDING" : "COMPLETED");

    // Hover opens without taking focus and closes on leave; a click or key open stays until dismissed.
    const hoverProps = timed && !isTouch ? {
        onPointerEnter: (e: React.PointerEvent) => {
            if (e.pointerType !== "mouse") return;
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            if (menuOpen) return;
            hoverTimer.current = setTimeout(() => { openedByHover.current = true; setMenuOpen(true); }, HOVER_OPEN_MS);
        },
        onPointerLeave: (e: React.PointerEvent) => {
            if (e.pointerType !== "mouse") return;
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            if (menuOpen && !openedByHover.current) return;
            hoverTimer.current = setTimeout(() => setMenuOpen(false), HOVER_CLOSE_MS);
        },
    } : {};
    const onMenuOpenChange = (open: boolean) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        if (!open) openedByHover.current = false;
        setMenuOpen(open);
    };

    const clearPress = () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        pressTimer.current = null;
    };

    const isToday = date === today;
    const counts = timed ? timeProgress(habit.times!, timeMarksOn(habit.times!, log)) : null;
    const progress = status !== "PENDING" ? null : counts ? (counts.total - counts.open > 0 ? `${counts.total - counts.open}/${counts.total}` : null) : stepProgress(habit, log);
    const state = status === "COMPLETED" ? "done" : status === "SKIPPED" ? "skipped" : progress ? `${progress.replace("/", " of ")} ${timed ? "times" : "steps"}` : isToday ? "open today" : "not logged";
    const look = status === "COMPLETED"
        ? "border border-transparent bg-[color-mix(in_srgb,var(--routine-tone)_80%,transparent)] text-[var(--primary-foreground)]"
        : status === "SKIPPED"
            ? "border border-twilight-border/45 text-twilight-text-muted hover:border-twilight-border"
            : isToday
                ? "border-[1.5px] border-[color-mix(in_srgb,var(--routine-tone)_60%,transparent)] text-[var(--routine-tone)] hover:bg-[color-mix(in_srgb,var(--routine-tone)_10%,transparent)]"
                : progress
                    ? "border border-[color-mix(in_srgb,var(--routine-tone)_35%,transparent)] text-twilight-text-soft hover:border-[color-mix(in_srgb,var(--routine-tone)_60%,transparent)]"
                    : "border border-dashed border-transparent text-twilight-text-soft hover:border-twilight-text-muted focus-visible:border-twilight-text-muted";

    return (
        <Popover.Root open={menuOpen} onOpenChange={onMenuOpenChange}>
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
                        openedByHover.current = false;
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
                    onPointerEnter={hoverProps.onPointerEnter}
                    onPointerLeave={(e) => { clearPress(); hoverProps.onPointerLeave?.(e); }}
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
                            : label ?? progress ?? (isToday ? <RoutineMark emoji={habit.emoji} size={13} /> : <span aria-hidden="true" className="h-1 w-1 rounded-full bg-twilight-text-muted/70" />)}
                </button>
            </Popover.Anchor>
            <Popover.Content
                side="top"
                align="center"
                style={style}
                className="w-auto rounded-3xl p-2"
                aria-label={`${habit.title}, ${dayLabel}`}
                {...hoverProps}
                onOpenAutoFocus={(e) => { if (openedByHover.current) e.preventDefault(); }}
                onCloseAutoFocus={(e) => { if (openedByHover.current) e.preventDefault(); }}
            >
                <p className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1 text-xs font-medium text-twilight-text-soft">
                    <span className="text-[var(--routine-tone)]"><RoutineMark emoji={habit.emoji} size={12} /></span>
                    {dayLabel}
                </p>
                {timed ? <div className="w-64"><RoutineTimeChecklist habit={habit} date={date} log={log} /></div> : <div className="flex gap-1 px-1 pb-1">
                    {([
                        ["COMPLETED", "Done", Check, "bg-[color-mix(in_srgb,var(--routine-tone)_80%,transparent)] text-[var(--primary-foreground)]", "border-[1.5px] border-[color-mix(in_srgb,var(--routine-tone)_55%,transparent)] text-[var(--routine-tone)]"],
                        ["SKIPPED", "Skip", X, "bg-twilight-border/50 text-twilight-text", "border border-twilight-border/60 text-twilight-text-soft"],
                        ["PENDING", "Clear", RotateCcw, "bg-white/[0.08] text-twilight-text", "border border-dashed border-twilight-border/60 text-twilight-text-soft"],
                    ] as const).map(([next, text, Icon, on, off]) => {
                        const pressed = (status ?? "PENDING") === next;
                        return (
                            <button
                                key={next}
                                type="button"
                                aria-pressed={pressed}
                                onClick={() => { set(next, false); setMenuOpen(false); }}
                                className="group flex min-w-16 cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-2 py-1.5 text-xs font-medium text-twilight-text-soft transition-colors hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--routine-tone)]"
                            >
                                <span className={`flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,border-color,transform] duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100 ${pressed ? on : off}`}>
                                    <Icon size={16} strokeWidth={next === "COMPLETED" ? 3 : 2} aria-hidden="true" />
                                </span>
                                {text}
                            </button>
                        );
                    })}
                </div>}
                {habit.steps?.length ? (
                    <div className="mt-1 w-64 border-t border-twilight-border/30 pt-1">
                        <RoutineStepChecklist habit={habit} date={date} log={log} />
                    </div>
                ) : null}
            </Popover.Content>
        </Popover.Root>
    );
}
