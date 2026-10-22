// Planning offers: "Break into steps?" on a task that keeps slipping, "Leave for later?" on one that waits.
// Pure: which tasks MAY show an offer. The client then shows at most one, the first eligible row in its own list order.
// Uptake never raises how often anything is offered; only Not now and a stated "this doesn't help" change it.
import type { PlanningOffer } from "@cadence/contracts/planning";
import { addDays, type LocalDate } from "./time";

export interface OfferTask {
    id: string;
    state: string;
    waitingOn: string | null;
    dueDate: LocalDate | null;
    notBefore: LocalDate | null;
    openSteps: number;
    /** Hash of what Not now was said about (title, steps, waiting on): a change brings the offer back. */
    fingerprint: string;
    /** The days (in the last 28) it was moved to another time; one entry per move. */
    movedOn: LocalDate[];
}

export interface OfferDecline {
    taskId: string;
    kind: PlanningOffer;
    fingerprint: string;
    saidOn: LocalDate;
}

/** Moved this many times on this many different days in the last 28 → worth unpacking. */
const MIN_MOVES = 3;
const MIN_MOVE_DAYS = 2;
const MOVE_WINDOW_DAYS = 28;
/** A deadline this close would be hidden past its day by Leave for later. */
const DEADLINE_DAYS = 7;
/** This many Not nows of one offer on different tasks in this many days → it stops appearing on its own. */
const DECLINES_TO_STOP = 3;
const STOP_WINDOW_DAYS = 30;

/** A waiting task neither hidden now nor due within the week (Leave for later would hide it past its day). */
function fitsLater(t: OfferTask, today: LocalDate): boolean {
    const hidden = !!t.notBefore && t.notBefore > today;
    const nearDeadline = !!t.dueDate && t.dueDate <= addDays(today, DEADLINE_DAYS);
    return !hidden && !nearDeadline;
}

/** A task with no open steps, moved often enough on enough different days lately. */
function fitsSteps(t: OfferTask, today: LocalDate): boolean {
    const recent = t.movedOn.filter((d) => d > addDays(today, -MOVE_WINDOW_DAYS) && d <= today);
    return t.openSteps === 0 && recent.length >= MIN_MOVES && new Set(recent).size >= MIN_MOVE_DAYS;
}

export function eligibleOffers(
    tasks: readonly OfferTask[],
    ctx: { today: LocalDate; declines: readonly OfferDecline[]; avoid: readonly PlanningOffer[] },
): Record<PlanningOffer, string[]> {
    const { today, declines } = ctx;
    const out: Record<PlanningOffer, string[]> = { steps: [], later: [] };
    const stopped = (kind: PlanningOffer) =>
        ctx.avoid.includes(kind) ||
        new Set(declines.filter((d) => d.kind === kind && d.saidOn > addDays(today, -STOP_WINDOW_DAYS)).map((d) => d.taskId)).size >= DECLINES_TO_STOP;
    const declined = (t: OfferTask, kind: PlanningOffer) => declines.some((d) => d.taskId === t.id && d.kind === kind && d.fingerprint === t.fingerprint);

    const offered = (t: OfferTask, kind: PlanningOffer) => !stopped(kind) && !declined(t, kind);

    for (const t of tasks) {
        if (t.state === "COMPLETE" || t.state === "ARCHIVED") continue;
        if (t.state === "WAITING") {
            if (fitsLater(t, today) && offered(t, "later")) out.later.push(t.id);
            continue;
        }
        if (fitsSteps(t, today) && offered(t, "steps")) out.steps.push(t.id);
    }
    return out;
}

/** Where Leave for later hides a waiting task until: its check-in day if that is ahead, else a week from today. */
export function leaveUntil(task: { waitingReminderDay: LocalDate | null }, today: LocalDate): LocalDate {
    return task.waitingReminderDay && task.waitingReminderDay > today ? task.waitingReminderDay : addDays(today, 7);
}
