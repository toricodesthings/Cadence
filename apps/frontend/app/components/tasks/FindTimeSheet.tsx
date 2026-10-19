import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import type { TimeOfDay } from "@cadence/contracts/planning";
import { DAY_END, type Proposal } from "@cadence/domain/find-time";
import { addDays, atLocal, formatInZone, wallTimeOf, type LocalDate } from "@cadence/domain/time";
import type { Task } from "@cadence/contracts/task";
import { Button } from "../primitives/Button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../primitives/Dialog";
import { DurationChoices } from "../assistant/DurationChips";
import { statusOf, useFindTime } from "../../hooks/tasks/use-find-time";
import { toastError } from "../../lib/utils/error-toast";
import { useSettings } from "../../hooks/core/use-settings";
import { useTask } from "../../hooks/tasks/use-tasks";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import type { DayPlan } from "../../lib/planning/day-plan";
import { proposalLabel } from "../../lib/planning/day-plan";
import { formatMinutes } from "@cadence/domain/duration-chips";
import { temporalOf } from "../../lib/utils/calendar/schedule-model";
import { toastName, toastUndo } from "../../lib/utils/undo-toast";
import { getUserZone, today, useUserZone } from "../../lib/utils/user-zone";
import { useFindTimeStore } from "../../stores/find-time-store";
import { cn } from "../../lib/utils";

const DAYS_SHOWN = 14;

/** The day as a bar from the calendar's first hour to the day's end: other blocks muted, the proposal as a ghost of the block that would be made. */
function MiniDay({ day, startHour, busy, proposal }: { day: LocalDate; startHour: number; busy: readonly { start: string; end: string }[]; proposal: Proposal | null }) {
    const zone = useUserZone();
    const from = Math.max(startHour, 6) * 60;
    const to = Number(DAY_END.slice(0, 2)) * 60;
    const span = to - from;
    const at = (instant: string) => {
        const [h, m] = wallTimeOf(instant, zone).split(":").map(Number);
        return Math.min(Math.max(((h * 60 + m - from) / span) * 100, 0), 100);
    };
    // A block that crosses midnight or the window's edge is clipped, never drawn outside the bar.
    const bar = (start: string, end: string) => {
        const left = at(start);
        const right = formatInZone(end, zone, { day: "numeric" }) === formatInZone(start, zone, { day: "numeric" }) ? at(end) : 100;
        return { left: `${left}%`, width: `${Math.max(right - left, 0.8)}%` };
    };
    return (
        <div className="flex flex-col gap-1" aria-hidden="true">
            <div className="relative h-6 overflow-hidden rounded-full bg-twilight-surface/50">
                {busy.map((b) => <span key={`${b.start}-${b.end}`} className="absolute inset-y-1 rounded-full bg-moonlit/40" style={bar(b.start, b.end)} />)}
                {proposal ? <span className="absolute inset-y-0.5 rounded-full border border-dashed border-accent-primary bg-accent-primary/25" style={bar(proposal.start, proposal.end)} /> : null}
            </div>
            <div className="flex justify-between px-1 text-[10px] tabular-nums text-twilight-text-muted">
                {[from, ...[9, 12, 15, 18, 21].map((h) => h * 60).filter((m) => m > from), to].map((m) => <span key={m}>{Math.floor(m / 60)}</span>)}
            </div>
            <span className="sr-only">{day}</span>
        </div>
    );
}

/**
 * Find a time, in full: for Other day, or when the day has no gap. A strip of the next two weeks, the day's first gap
 * drawn on a small timeline with Place here, and Another time to step through the rest. The sheet on a phone, a dialog
 * with a mouse (the shared Dialog does the switching). Nothing is written until Place here.
 */
export function FindTimeSheet() {
    const request = useFindTimeStore((s) => s.request);
    const close = useFindTimeStore((s) => s.close);
    const task = useTask(request?.taskId);
    return (
        <Dialog open={!!request} onOpenChange={(open) => { if (!open) close(); }}>
            {request && task ? <SheetBody key={request.taskId} task={task} start={request.day} anchorDay={request.anchorDay} reason={request.reason} onClose={close} /> : null}
        </Dialog>
    );
}

function SheetBody({ task, start, anchorDay, reason, onClose }: { task: Task; start: LocalDate; anchorDay: LocalDate | null; reason?: "no-gap"; onClose: () => void }) {
    const zone = getUserZone();
    const find = useFindTime();
    const updateTask = useUpdateTask();
    const { data: settings } = useSettings();
    const startHour = settings?.calendar?.timelineStartHour ?? 7;
    const [day, setDay] = useState<LocalDate>(start);
    const [plan, setPlan] = useState<DayPlan | null>(null);
    const [index, setIndex] = useState(0);
    const [seen, setSeen] = useState<TimeOfDay[]>([]);
    const [placing, setPlacing] = useState(false);
    const [editingLength, setEditingLength] = useState(false);
    const [before] = useState(() => temporalOf(task));

    // The day's gaps, again whenever the day or the task's own length changes.
    useEffect(() => {
        let current = true;
        setPlan(null);
        void find.planFor(task, day).then((next) => {
            if (current) {
                setPlan(next);
                setIndex(0);
                setSeen(next.proposals[0] ? [next.proposals[0].bucket] : []);
            }
        });
        return () => { current = false; };
    }, [day, task.durationEstimate, task.id]); // eslint-disable-line react-hooks/exhaustive-deps -- planFor changes identity with every cache update

    const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today(), i)), []);
    const proposal = plan?.proposals[index] ?? null;
    const noGap = !!plan && plan.proposals.length === 0;
    const exhausted = !!plan && plan.proposals.length > 0 && index >= plan.proposals.length - 1;
    const dayName = formatInZone(atLocal(day, "12:00", zone), zone, { weekday: "short" });

    const onStripKey = (event: KeyboardEvent, i: number) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        for (let j = i + step; j >= 0 && j < days.length; j += step) {
            if (!task.notBefore || days[j] >= task.notBefore) {
                setDay(days[j]);
                (event.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
                return;
            }
        }
    };

    const another = () => {
        if (!plan) return;
        const next = index + 1;
        setIndex(next);
        setSeen((current) => [...new Set([...current, plan.proposals[next].bucket])]);
    };

    const place = async () => {
        if (!proposal || placing) return;
        setPlacing(true);
        try {
            await find.write(task, proposal, seen);
            toastUndo(toastName(task.title, 40), () => void updateTask.mutateAsync({ id: task.id, ...before, findTime: { undo: true } }), {
                description: proposalLabel(proposal, zone),
            });
            onClose();
        } catch (error) {
            setPlacing(false); // any other failure said why itself
            if (statusOf(error) === 409) {
                // The calendar changed elsewhere: say so and look at the day again.
                toastError(error, "Couldn't place it");
                setPlan(await find.planFor(task, day));
                setIndex(0);
            }
        }
    };

    const setLength = (minutes: number) => {
        updateTask.mutate({ id: task.id, durationEstimate: minutes });
        setEditingLength(false);
        toast.dismiss();
    };

    return (
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
            <DialogHeader>
                <DialogTitle>Find a time</DialogTitle>
                <p className="truncate text-sm text-twilight-text-soft">{task.title}</p>
            </DialogHeader>

            <div role="radiogroup" aria-label="Day" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {days.map((d, i) => {
                    const disabled = !!task.notBefore && d < task.notBefore;
                    const selected = d === day;
                    return (
                        <button
                            key={d}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={formatInZone(atLocal(d, "12:00", zone), zone, { weekday: "long", month: "long", day: "numeric" })}
                            disabled={disabled}
                            tabIndex={selected ? 0 : -1}
                            onKeyDown={(event) => onStripKey(event, i)}
                            onClick={() => setDay(d)}
                            className={cn(
                                "flex min-h-11 min-w-11 shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:cursor-default disabled:opacity-40",
                                selected ? "bg-accent-primary/20 text-twilight-text ring-1 ring-accent-primary/40" : "bg-twilight-surface/40 text-twilight-text-soft hover:bg-twilight-surface-hover/60",
                            )}
                        >
                            <span>{formatInZone(atLocal(d, "12:00", zone), zone, { weekday: "short" })}</span>
                            <span className="text-sm font-medium tabular-nums">{d.slice(8)}</span>
                        </button>
                    );
                })}
            </div>

            <div role="status" aria-live="polite" className="flex min-h-[5.5rem] flex-col gap-2">
                {!plan ? <p className="text-sm text-twilight-text-muted">Looking…</p> : null}
                {proposal ? (
                    <>
                        <p className="text-base font-medium text-twilight-text">{proposalLabel(proposal, zone)}</p>
                        {anchorDay && day > anchorDay ? <p className="text-xs text-twilight-text-muted">After its day</p> : null}
                        <MiniDay day={day} startHour={startHour} busy={plan?.busy ?? []} proposal={proposal} />
                        {exhausted && plan!.proposals.length > 1 ? <p className="text-xs text-twilight-text-muted">That’s every gap on {dayName}</p> : null}
                    </>
                ) : null}
                {noGap ? (
                    <>
                        <p className="text-base text-twilight-text">No {formatMinutes(plan!.minutes)} gap on {dayName}.</p>
                        {reason === "no-gap" ? <p className="text-xs text-twilight-text-muted">Nothing was moved. Pick another day, or change how long it takes.</p> : null}
                    </>
                ) : null}
            </div>

            {noGap || editingLength ? (
                <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-twilight-text-muted">Takes {plan ? formatMinutes(plan.minutes) : ""}</p>
                    {editingLength ? (
                        <DurationChoices reference={null} pointsOnly skipLabel="Cancel" onSkip={() => setEditingLength(false)} onPick={(value) => value.kind === "point" && setLength(value.minutes)} />
                    ) : (
                        <button type="button" onClick={() => setEditingLength(true)} className="min-h-11 w-fit cursor-pointer rounded-full px-3 text-sm text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                            Change how long it takes
                        </button>
                    )}
                </div>
            ) : null}

            <DialogFooter>
                <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
                <Button variant="secondary" size="md" onClick={another} disabled={!plan || exhausted || noGap}>Another time</Button>
                <Button variant="cardPrimary" size="md" onClick={() => void place()} disabled={!proposal || placing}>Place here</Button>
            </DialogFooter>
        </DialogContent>
    );
}
