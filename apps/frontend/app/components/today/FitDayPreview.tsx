import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { X } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { DAY_END } from "@cadence/domain/find-time";
import type { FitDayResult } from "@cadence/domain/fit-day";
import { atLocal, formatInZone, type Instant, type LocalDate } from "@cadence/domain/time";
import { Button } from "../primitives/Button";
import { Tip } from "../primitives";
import { DurationChoices } from "../assistant/DurationChips";
import { useOnlineStatus } from "../../hooks/core/use-online-status";
import { usePlaceTasks, type FitDay, type FitPlacement } from "../../hooks/tasks/use-fit-day";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { statusOf } from "../../hooks/tasks/use-find-time";
import { formatChipTime } from "../../lib/utils/date-format";
import { toastError } from "../../lib/utils/error-toast";
import { useToday, useUserZone } from "../../lib/utils/user-zone";

const STEP = 15;
const MIN = 60_000;

const ROW_BUTTON =
    "touch-target inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/** The window the rule looks in (the calendar's first hour, never before 06:00, to 22:00), as instants on `day`. */
function windowOf(day: LocalDate, startHour: number, zone: string) {
    const hour = String(Math.max(startHour, 6)).padStart(2, "0");
    return { from: Date.parse(atLocal(day, `${hour}:00`, zone)), to: Date.parse(atLocal(day, DAY_END, zone)) };
}

/** `p` moved by `minutes`, kept inside the window. */
function shifted(p: FitPlacement, minutes: number, window: { from: number; to: number }): FitPlacement {
    const length = Date.parse(p.end) - Date.parse(p.start);
    const start = Math.min(Math.max(Date.parse(p.start) + minutes * MIN, window.from), window.to - length);
    return { ...p, start: new Date(start).toISOString(), end: new Date(start + length).toISOString() };
}

/**
 * The day as one bar: other blocks muted, each placement a ghost of the block it would make. A ghost drags along the
 * bar (snapping to 15 minutes) or moves with the arrow keys; moving one never moves the others.
 */
function FitTimeline({ day, startHour, busy, placed, titleOf, onMove }: {
    day: LocalDate;
    startHour: number;
    busy: readonly { start: Instant; end: Instant }[];
    placed: readonly FitPlacement[];
    titleOf: (id: string) => string;
    onMove: (next: FitPlacement) => void;
}) {
    const zone = useUserZone();
    const bar = useRef<HTMLDivElement>(null);
    const drag = useRef<{ placement: FitPlacement; x: number } | null>(null);
    const bounds = windowOf(day, startHour, zone);
    const span = bounds.to - bounds.from;
    const left = (instant: Instant) => Math.min(Math.max(((Date.parse(instant) - bounds.from) / span) * 100, 0), 100);
    const box = (start: Instant, end: Instant) => ({ left: `${left(start)}%`, width: `${Math.max(left(end) - left(start), 0.8)}%` });
    const first = Math.max(startHour, 6);
    const hours = [first, ...[9, 12, 15, 18, 21].filter((h) => h > first), 22];

    const move = (event: PointerEvent<HTMLButtonElement>) => {
        const from = drag.current;
        const width = bar.current?.getBoundingClientRect().width;
        if (!from || !width) return;
        const minutes = Math.round((((event.clientX - from.x) / width) * span) / MIN / STEP) * STEP;
        onMove(shifted(from.placement, minutes, bounds));
    };
    const onKey = (event: KeyboardEvent, p: FitPlacement) => {
        const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? STEP : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -STEP : 0;
        if (!step) return;
        event.preventDefault();
        onMove(shifted(p, step, bounds));
    };

    return (
        <div className="flex flex-col gap-1" data-sheet-no-drag>
            <div ref={bar} className="relative h-10 overflow-hidden rounded-2xl bg-twilight-surface/50">
                {busy.map((b) => <span key={`${b.start}-${b.end}`} aria-hidden="true" className="absolute inset-y-1.5 rounded-xl bg-moonlit/35" style={box(b.start, b.end)} />)}
                {placed.map((p) => {
                    const title = titleOf(p.taskId);
                    const minutesIn = Math.round((Date.parse(p.start) - bounds.from) / MIN);
                    return (
                        <button
                            key={p.taskId}
                            type="button"
                            role="slider"
                            aria-label={title}
                            aria-valuemin={0}
                            aria-valuemax={Math.round(span / MIN)}
                            aria-valuenow={minutesIn}
                            aria-valuetext={`${title}, ${formatChipTime(p.start, p.end)}. Arrow keys move it by 15 minutes.`}
                            onKeyDown={(event) => onKey(event, p)}
                            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { placement: p, x: event.clientX }; }}
                            onPointerMove={move}
                            onPointerUp={() => { drag.current = null; }}
                            onPointerCancel={() => { drag.current = null; }}
                            className="absolute inset-y-0.5 cursor-grab touch-none overflow-hidden rounded-xl border border-dashed border-accent-primary bg-accent-primary/25 px-1 text-left text-[10px] font-medium leading-9 text-twilight-text active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
                            style={box(p.start, p.end)}
                        >
                            <span className="block truncate" aria-hidden="true">{title}</span>
                        </button>
                    );
                })}
            </div>
            <div className="flex justify-between px-1 text-[10px] tabular-nums text-twilight-text-muted" aria-hidden="true">
                {hours.map((h) => <span key={h}>{h}</span>)}
            </div>
        </div>
    );
}

/**
 * Fit today's preview, shared by Today (inline on a desktop, a sheet on a phone) and the assistant's card: the day with
 * a ghost for each task placed, the rows to drop (×), what didn't fit, and the tasks with no known length, each with
 * the length chips (choosing one stores it and adds the task). Nothing is written until Place; one Undo puts it back.
 */
export function FitDayPreview({ day, fit, initial, ordered, titles, notice, onDone }: {
    day: LocalDate;
    fit: FitDay;
    initial: FitDayResult | null;
    /** The tasks to lay out again when the day changed (Today passes its visible order). */
    ordered?: readonly Task[];
    /** Names to fall back on for tasks the device hasn't read (the assistant's card). */
    titles?: ReadonlyMap<string, string>;
    /** Said first, e.g. "Your day changed" when a card's plan is for a day that has passed. */
    notice?: string;
    /** Placed (true), or Cancel (false). */
    onDone: (placed: boolean) => void;
}) {
    const zone = useUserZone();
    const today = useToday();
    const online = useOnlineStatus();
    const placeTasks = usePlaceTasks();
    const updateTask = useUpdateTask();
    const [draft, setDraft] = useState<FitDayResult | null>(initial);
    const [status, setStatus] = useState<string | null>(notice ?? null);
    const [recompute, setRecompute] = useState(initial === null);
    const [placing, setPlacing] = useState(false);
    const [sizing, setSizing] = useState(0);

    // Laid out again from fresh data: when opened without a plan, and after "Your day changed".
    useEffect(() => {
        if (!recompute || !fit.ready) return;
        setDraft(fit.plan(ordered));
        setRecompute(false);
    }, [recompute, fit.ready, fit.plan]); // eslint-disable-line react-hooks/exhaustive-deps -- `ordered` is read at the moment of laying out

    const titleOf = (id: string) => fit.byId.get(id)?.title ?? titles?.get(id) ?? "Task";
    const dayChanged = async () => {
        setStatus("Your day changed");
        await fit.refresh();
        setRecompute(true);
    };

    if (!draft) return <p role="status" className="text-sm text-twilight-text-muted">Looking at {day === today ? "today" : "the day"}…</p>;

    const placed = [...draft.placed].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const n = placed.length;
    const dayName = day === today ? "today" : formatInZone(atLocal(day, "12:00", zone), zone, { weekday: "long" });

    const move = (next: FitPlacement) => setDraft({ ...draft, placed: draft.placed.map((p) => (p.taskId === next.taskId ? next : p)) });
    const drop = (id: string) => setDraft({ ...draft, placed: draft.placed.filter((p) => p.taskId !== id) });
    const leaveOut = (id: string) => setDraft({ ...draft, notSized: draft.notSized.filter((x) => x !== id) });

    // The person's tap stores the length; the task then takes the first gap left around what's already laid out.
    const size = async (id: string, minutes: number) => {
        const task = fit.byId.get(id);
        if (!task) return;
        setSizing((c) => c + 1);
        try {
            await updateTask.mutateAsync({ id, durationEstimate: minutes });
        } catch {
            return; // the write said why itself
        } finally {
            setSizing((c) => c - 1);
        }
        const one = fit.plan([{ ...task, durationEstimate: minutes }], draft.placed);
        setDraft((current) => current && {
            placed: [...current.placed, ...one.placed],
            didntFit: [...current.didntFit, ...one.didntFit],
            notSized: current.notSized.filter((x) => x !== id),
        });
    };

    const place = async () => {
        if (!n || placing) return;
        if (placed.some((p) => !fit.byId.has(p.taskId))) return void dayChanged();
        setPlacing(true);
        try {
            await placeTasks(placed, fit.byId);
            onDone(true);
        } catch (error) {
            if (statusOf(error) === 409) await dayChanged();
            else toastError(error, "Couldn't place them");
        } finally {
            setPlacing(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <p role="status" aria-live="polite" className="min-h-0 text-sm text-twilight-text-soft empty:hidden">{status}</p>

            {n ? (
                <>
                    <FitTimeline day={day} startHour={fit.timelineStartHour} busy={fit.busy} placed={placed} titleOf={titleOf} onMove={move} />
                    <ul className="flex flex-col gap-1" aria-label="Placed">
                        {placed.map((p) => (
                            <li key={p.taskId} className="surface-item flex min-h-11 items-center gap-3 rounded-2xl pl-3 pr-1">
                                <span className="w-[7.5rem] shrink-0 text-xs tabular-nums text-accent-primary">{formatChipTime(p.start, p.end)}</span>
                                <span className="min-w-0 flex-1 truncate text-sm text-twilight-text">{titleOf(p.taskId)}</span>
                                <Tip label="Leave out">
                                    <button type="button" onClick={() => drop(p.taskId)} aria-label={`Leave ${titleOf(p.taskId)} out`} className={ROW_BUTTON}>
                                        <X size={15} aria-hidden="true" />
                                    </button>
                                </Tip>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <p className="text-sm text-twilight-text-soft">{draft.notSized.length ? "Choose how long these take to place them." : `Nothing fits ${dayName}'s gaps.`}</p>
            )}

            {draft.didntFit.length ? (
                <p className="text-sm text-twilight-text-muted">
                    {draft.didntFit.length} didn’t fit · they stay on {dayName}
                    <span className="sr-only">: {draft.didntFit.map(titleOf).join(", ")}</span>
                </p>
            ) : null}

            {draft.notSized.length ? (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-twilight-text-muted">{draft.notSized.length} not sized</p>
                    {draft.notSized.map((id) => (
                        <div key={id} className="flex flex-col gap-1.5">
                            <span className="truncate text-sm text-twilight-text">{titleOf(id)}</span>
                            <DurationChoices reference={null} pointsOnly disabled={!fit.byId.has(id)} skipLabel="Leave out" onSkip={() => leaveOut(id)} onPick={(value) => value.kind === "point" && void size(id, value.minutes)} />
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {!online ? <span className="mr-auto text-xs text-twilight-text-muted">Needs a connection</span> : null}
                <Button variant="ghost" size="md" onClick={() => onDone(false)}>Cancel</Button>
                <Button variant="cardPrimary" size="md" onClick={() => void place()} disabled={!n || !online || placing || sizing > 0}>
                    {n ? `Place ${n}` : "Place"}
                </Button>
            </div>
        </div>
    );
}
