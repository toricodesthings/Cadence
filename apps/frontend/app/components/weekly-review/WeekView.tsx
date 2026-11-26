import { useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, ChevronRight, Flag, Flame, Sun } from "lucide-react";
import type { useWeekRoom } from "../../hooks/core/use-week-room";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { parseYMD } from "../../lib/utils/calendar/calendar-math";
import { dayHoursOf, type DayHours } from "@cadence/domain/find-time";
import { useSettings } from "../../hooks/core/use-settings";
import {
    formatShortDate,
    formatTime,
    formatWallTime,
    formatWeekdayLong,
    formatWeekdayShort,
} from "../../lib/utils/date-format";
import { routineTone } from "../../lib/utils/habits";
import { getTaskSeriesId } from "../../lib/utils/task/task-scheduling";
import { RoutineMark } from "../habits/RoutineMark";

type Day = ReturnType<typeof useWeekRoom>["room"][number];
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function hm(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const hourLabel = (hour: number) =>
    hour >= 24 ? "Midnight" : formatWallTime(`${String(hour).padStart(2, "0")}:00`).replace(":00 ", " ");

function hShort(minutes: number) {
    return minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes)}m`;
}

function DayTile({
    day,
    today,
    selected,
    onSelect,
}: {
    day: Day;
    today: boolean;
    selected: boolean;
    onSelect: () => void;
}) {
    const due = day.deadlines.length;
    const label = [
        `${formatWeekdayLong(day.day)}, ${hm(day.openMinutes)} free`,
        day.blocks.length && `${day.blocks.length} planned`,
        due && `${due} due`,
        day.routinesDue && plural(day.routinesDue, "routine"),
    ]
        .filter(Boolean)
        .join(", ");
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={label}
            className={`press flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-0.5 py-2.5 transition-[background-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                selected
                    ? "bg-accent-primary text-[var(--primary-foreground)]"
                    : "text-twilight-text hover:bg-panel-raised/40"
            }`}
        >
            <span
                className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${
                    selected ? "" : today ? "text-accent-primary" : "text-twilight-text-muted"
                }`}
            >
                {formatWeekdayShort(day.day)}
            </span>
            <span className="font-display text-xl font-semibold leading-none tabular-nums">{parseYMD(day.day).d}</span>
            <span
                aria-hidden="true"
                className={`flex h-4 items-center gap-0.5 text-xs font-medium tabular-nums ${selected ? "" : "text-twilight-text-soft"}`}
            >
                {hShort(day.openMinutes)}
                {due ? (
                    <Flag
                        size={10}
                        fill="currentColor"
                        className={`shrink-0 ${selected ? "" : "text-accent-secondary"}`}
                    />
                ) : null}
            </span>
        </button>
    );
}

function FreeRing({ day, fullDay }: { day: Day; fullDay: number }) {
    const r = 42;
    const c = 2 * Math.PI * r;
    const free = fullDay > 0 ? Math.min(1, day.openMinutes / fullDay) : 0;
    return (
        <div className="relative grid size-32 shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-twilight-border/50" />
                {free > 0 ? (
                    <circle
                        cx="50"
                        cy="50"
                        r={r}
                        fill="none"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${free * c} ${c}`}
                        className="stroke-accent-primary transition-[stroke-dasharray] duration-500"
                    />
                ) : null}
            </svg>
            <span className="flex flex-col items-center leading-none">
                <span className="font-display text-xl font-semibold tabular-nums text-twilight-text">
                    {hm(day.openMinutes)}
                </span>
                <span className="mt-1 text-xs text-twilight-text-soft">free</span>
            </span>
        </div>
    );
}

function Pill({ icon: Icon, tone, children }: { icon: typeof Flag; tone: string; children: ReactNode }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums ${tone}`}
        >
            <Icon size={13} aria-hidden="true" /> {children}
        </span>
    );
}

function Group({
    icon: Icon,
    title,
    tone = "text-accent-primary",
    children,
}: {
    icon: typeof Flag;
    title: string;
    tone?: string;
    children: ReactNode;
}) {
    return (
        <section className="flex min-w-0 flex-col gap-2">
            <h3 className="flex items-center gap-2 px-1 text-sm font-semibold text-twilight-text-soft">
                <Icon size={15} aria-hidden="true" className={tone} /> {title}
            </h3>
            <ul className="surface-card overflow-hidden rounded-2xl [&>li+li]:border-t [&>li+li]:border-twilight-border/40">
                {children}
            </ul>
        </section>
    );
}

function Row({ lead, title, onOpen }: { lead: ReactNode; title: string; onOpen: () => void }) {
    return (
        <li>
            <button
                type="button"
                onClick={onOpen}
                className="group flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-panel-raised/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/50"
            >
                {lead}
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-twilight-text">{title}</span>
                <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-twilight-text-muted" />
            </button>
        </li>
    );
}

function DayView({
    day,
    hours,
    today,
    onOpenTask,
    onOpenRoutine,
}: {
    day: Day;
    hours: Required<DayHours>;
    today: boolean;
    onOpenTask: (id: string) => void;
    onOpenRoutine: (id: string) => void;
}) {
    const empty = !day.blocks.length && !day.due.length && !day.routines.length;
    return (
        <div className="flex flex-col gap-6">
            <header className="surface-card flex items-center gap-5 rounded-3xl p-5 @3xl:gap-7 @3xl:p-6">
                <FreeRing day={day} fullDay={(hours.dayEndHour - Math.max(hours.timelineStartHour, 6)) * 60} />
                <div className="flex min-w-0 flex-col gap-3">
                    <div>
                        <h2 className="font-display text-2xl font-semibold leading-tight tracking-[-0.01em] text-twilight-text">
                            {today ? "Today" : formatWeekdayLong(day.day)}
                        </h2>
                        <p className="text-[0.9375rem] text-twilight-text-soft">
                            {today ? `${formatWeekdayLong(day.day)}, ` : ""}
                            {formatShortDate(day.day)} · {hourLabel(hours.timelineStartHour)}–
                            {hourLabel(hours.dayEndHour)}
                        </p>
                    </div>
                    {empty ? (
                        <p className="flex items-center gap-2 text-[0.9375rem] text-twilight-text-soft">
                            <Sun size={16} aria-hidden="true" className="shrink-0 text-accent-primary" /> Nothing
                            planned. The day is yours.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {day.blocks.length ? (
                                <Pill icon={CalendarClock} tone="bg-accent-primary/12 text-accent-primary">
                                    {day.blocks.length} planned · {hm(day.bookedMinutes)}
                                </Pill>
                            ) : null}
                            {day.due.length ? (
                                <Pill icon={Flag} tone="bg-accent-secondary/15 text-accent-secondary">
                                    {day.due.length} due
                                </Pill>
                            ) : null}
                            {day.routines.length ? (
                                <Pill icon={Flame} tone="bg-accent-primary/12 text-accent-primary">
                                    {plural(day.routines.length, "routine")}
                                </Pill>
                            ) : null}
                        </div>
                    )}
                </div>
            </header>
            {empty ? null : (
                <div className="grid gap-6 @3xl:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-6">
                        {day.blocks.length ? (
                            <Group icon={CalendarClock} title="Planned">
                                {day.blocks.map((t) => (
                                    <Row
                                        key={t.id}
                                        title={t.title}
                                        onOpen={() => onOpenTask(getTaskSeriesId(t))}
                                        lead={
                                            <span className="flex min-w-[4.75rem] shrink-0 flex-col whitespace-nowrap border-l-2 border-accent-primary pl-2.5 leading-tight tabular-nums">
                                                <span className="text-sm font-semibold text-twilight-text">
                                                    {formatTime(t.scheduledStart!)}
                                                </span>
                                                {t.scheduledEnd ? (
                                                    <span className="text-xs text-twilight-text-soft">
                                                        {formatTime(t.scheduledEnd)}
                                                    </span>
                                                ) : null}
                                            </span>
                                        }
                                    />
                                ))}
                            </Group>
                        ) : null}
                        {day.due.length ? (
                            <Group icon={Flag} title="Due" tone="text-accent-secondary">
                                {day.due.map((t) => (
                                    <Row
                                        key={t.id}
                                        title={t.title}
                                        onOpen={() => onOpenTask(getTaskSeriesId(t))}
                                        lead={
                                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-panel-raised">
                                                <Flag size={13} aria-hidden="true" className="text-accent-secondary" />
                                            </span>
                                        }
                                    />
                                ))}
                            </Group>
                        ) : null}
                    </div>
                    {day.routines.length ? (
                        <section className="flex min-w-0 flex-col gap-2">
                            <h3 className="flex items-center gap-2 px-1 text-sm font-semibold text-twilight-text-soft">
                                <Flame size={15} aria-hidden="true" className="text-accent-primary" /> Routines
                            </h3>
                            <ul className="surface-card grid grid-cols-2 gap-1.5 rounded-2xl p-1.5">
                                {day.routines.map((h) => (
                                    <li key={h.id} className="min-w-0">
                                        <button
                                            type="button"
                                            onClick={() => onOpenRoutine(h.id)}
                                            style={{ "--routine-tone": routineTone(h.colorAccent) } as CSSProperties}
                                            className="press flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-panel-raised/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                                        >
                                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--routine-tone)_18%,transparent)] text-[var(--routine-tone)]">
                                                <RoutineMark emoji={h.emoji} size={15} />
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-sm text-twilight-text">
                                                {h.title}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}
                </div>
            )}
        </div>
    );
}

export function WeekView({
    room,
    onOpenTask,
    onOpenRoutine,
}: {
    room: Day[];
    onOpenTask: (id: string) => void;
    onOpenRoutine: (id: string) => void;
}) {
    const [picked, setPicked] = useState(room[0]?.day);
    const reduced = useReducedMotionSetting();
    const hours = dayHoursOf(useSettings().data);
    const day = room.find((d) => d.day === picked) ?? room[0];
    if (!day) return null;
    return (
        <div className="flex flex-col gap-5">
            <ol className="grid grid-cols-7 gap-1.5 @2xl:gap-2" aria-label="Your next 7 days">
                {room.map((d, i) => (
                    <li key={d.day}>
                        <DayTile
                            day={d}
                            today={i === 0}
                            selected={d.day === day.day}
                            onSelect={() => setPicked(d.day)}
                        />
                    </li>
                ))}
            </ol>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={day.day}
                    initial={{ opacity: 0, transform: reduced ? "none" : "translateY(6px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                >
                    <DayView
                        day={day}
                        hours={hours}
                        today={day.day === room[0]!.day}
                        onOpenTask={onOpenTask}
                        onOpenRoutine={onOpenRoutine}
                    />
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
