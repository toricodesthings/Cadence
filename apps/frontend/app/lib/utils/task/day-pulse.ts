import { CalendarHeart, Clock, Feather, Hourglass, Sun, Sunrise, Zap, type LucideIcon } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import type { LocalDate, WallTime } from "@cadence/domain/time";
import {
    analyzeDayPulse,
    type DayPulse,
    type DayPulseItem,
    type DayPulseKind,
    type DayPulseTone,
} from "@cadence/nlp/day-pulse";
import { scheduleKind } from "../calendar/schedule-day";
import { dayOfInstant, formatWallTime, toTimeValue } from "../date-format";
import { formatDayMinutes } from "./day-load";

type Level = 1 | 2 | 3;
type PulseTask = Pick<
    Task,
    | "title"
    | "isHabit"
    | "interactionMode"
    | "scheduledStart"
    | "scheduledEnd"
    | "durationEstimate"
    | "effort"
    | "priority"
>;

const minutesOf = (time: WallTime) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export interface DayPulseOptions<T extends PulseTask> {
    eventCount: number;
    dayHours: { timelineStartHour: number; dayEndHour: number };
    nowMin: number | null;
    effortGuessOf: (task: T) => Level | null | undefined;
    durationGuessOf: (task: T) => { state: "tentative" | "supported"; minutes: number } | null;
    nlpEnabled: boolean;
}

export function buildDayPulse<T extends PulseTask>(day: LocalDate, tasks: readonly T[], opts: DayPulseOptions<T>) {
    const items: DayPulseItem[] = [];
    for (const task of tasks) {
        const kind = scheduleKind(task);
        if (kind === "routine") continue;
        const start = task.scheduledStart;
        const end = task.scheduledEnd;
        const guess = opts.durationGuessOf(task);
        items.push({
            kind,
            title: task.title,
            startMin: start ? minutesOf(toTimeValue(start)) : null,
            endMin: start && end ? (dayOfInstant(end) > day ? 1440 : minutesOf(toTimeValue(end))) : null,
            knownMinutes: task.durationEstimate ?? (guess?.state === "supported" ? guess.minutes : null),
            effort: (task.effort as Level | null) ?? null,
            effortGuess: opts.effortGuessOf(task) ?? null,
            priority: task.priority,
        });
    }
    return analyzeDayPulse({
        items,
        eventCount: opts.eventCount,
        dayStartMin: opts.dayHours.timelineStartHour * 60,
        dayEndMin: opts.dayHours.dayEndHour * 60,
        nowMin: opts.nowMin,
        nlpCuesEnabled: opts.nlpEnabled,
    });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const wall = (min: number) =>
    formatWallTime(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);

export interface DayPulseView {
    kind: DayPulseKind;
    label: string;
    tone: DayPulseTone;
    Icon: LucideIcon;
    breakdown: string;
}

export function formatDayPulse(pulse: DayPulse): DayPulseView {
    const about = pulse.bookedMinutes > 0 ? ` · ~${formatDayMinutes(pulse.bookedMinutes)}` : "";
    const [label, Icon] = ((): [string, LucideIcon] => {
        switch (pulse.kind) {
            case "wide_open":
                return ["Wide open", Feather];
            case "event_only":
                return [`Open · ${plural(pulse.eventCount, "event")}`, CalendarHeart];
            case "free_after":
                return [`Free after ${wall(pulse.anchorMinutes ?? 0)}`, Sun];
            case "open_morning":
                return ["Open morning", Sunrise];
            case "open_afternoon":
                return ["Open afternoon", Sun];
            case "light":
                return [about ? `Light${about}` : "Light day", Feather];
            case "focused":
                return [about ? `Focus day${about}` : "Focus day", Zap];
            case "balanced":
                return [about ? `Paced${about}` : "Paced day", Clock];
            case "packed":
                return [about ? `Full day${about}` : "Full day", Hourglass];
        }
    })();
    const facts = [
        pulse.fixedCount ? plural(pulse.fixedCount, "fixed block") : null,
        pulse.taskCount ? plural(pulse.taskCount, "task") : null,
        pulse.eventCount ? plural(pulse.eventCount, "event") : null,
        pulse.bookedMinutes ? `~${formatDayMinutes(pulse.bookedMinutes)} booked` : null,
        pulse.unsizedCount ? `${pulse.unsizedCount} not sized` : null,
    ].filter(Boolean);
    return {
        kind: pulse.kind,
        label,
        tone: pulse.tone,
        Icon,
        breakdown: facts.length ? facts.join(" · ") : "Nothing booked",
    };
}
