import { useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, ChevronRight, Clock, Flag, Flame, Sun } from "lucide-react";
import type { useWeekRoom } from "../../hooks/core/use-week-room";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { parseYMD } from "../../lib/utils/calendar/calendar-math";
import { formatChipTime, formatShortDate, formatTime, formatWeekdayLong, formatWeekdayShort } from "../../lib/utils/date-format";
import { routineTone } from "../../lib/utils/habits";
import { getTaskSeriesId } from "../../lib/utils/task/task-scheduling";

type Day = ReturnType<typeof useWeekRoom>["room"][number];
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** "3h", "2h 30m", "45m". */
function hm(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** A tile's free time, rounded to the hour so seven fit side by side: "10h", "45m". */
function hShort(minutes: number) {
    return minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes)}m`;
}

/** One summary line on a tile: an icon and a number, only when there's something to say. */
function Stat({ icon: Icon, value, tone = "text-twilight-text-soft" }: { icon: typeof Clock; value: string | number; tone?: string }) {
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${tone}`}>
            <Icon size={12} aria-hidden="true" className="shrink-0 opacity-80" /> {value}
        </span>
    );
}

function DayTile({ day, today, selected, onSelect }: { day: Day; today: boolean; selected: boolean; onSelect: () => void }) {
    const total = day.bookedMinutes + day.openMinutes;
    const load = total > 0 ? day.bookedMinutes / total : 0;
    const due = day.deadlines.length;
    const label = [
        `${formatWeekdayLong(day.day)}, ${hm(day.openMinutes)} free`,
        day.blocks.length && `${day.blocks.length} planned`,
        due && `${due} due`,
        day.routinesDue && `${day.routinesDue} routine${day.routinesDue === 1 ? "" : "s"}`,
    ].filter(Boolean).join(", ");
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={label}
            className={`group flex h-full min-h-24 w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border px-1 py-3 text-center transition-[background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 @3xl:items-start @3xl:px-3.5 @3xl:text-left ${
                selected ? "border-accent-primary/45 bg-accent-primary/10" : "surface-card border-transparent hover:border-twilight-border"
            }`}
        >
            <span className="flex flex-col items-center leading-none @3xl:flex-row @3xl:items-baseline @3xl:gap-1.5">
                <span className={`text-xs font-medium uppercase tracking-[0.04em] ${today ? "text-accent-primary" : "text-twilight-text-muted"}`}>{formatWeekdayShort(day.day)}</span>
                <span className="mt-1 font-display text-xl font-semibold tabular-nums text-twilight-text @3xl:mt-0">{parseYMD(day.day).d}</span>
            </span>
            {/* How full the day is: a capsule, booked over the day's window. */}
            <span aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-twilight-border/40">
                <span className="block h-full rounded-full bg-accent-primary/80" style={{ width: `${Math.round(load * 100)}%` }} />
            </span>
            <span aria-hidden="true" className="flex flex-col items-center gap-1 @3xl:items-start">
                <Stat icon={Clock} value={hShort(day.openMinutes)} />
                <span className="hidden flex-col gap-1 @3xl:flex">
                    {day.blocks.length ? <Stat icon={CalendarClock} value={day.blocks.length} /> : null}
                    {due ? <Stat icon={Flag} value={due} tone="text-accent-secondary" /> : null}
                    {day.routinesDue ? <Stat icon={Flame} value={day.routinesDue} /> : null}
                </span>
                {/* Narrow tiles: one dot per kind of thing on the day. */}
                <span className="flex h-1.5 gap-1 @3xl:hidden">
                    {day.blocks.length ? <span className="size-1.5 rounded-full bg-twilight-text-soft" /> : null}
                    {due ? <span className="size-1.5 rounded-full bg-accent-secondary" /> : null}
                    {day.routinesDue ? <span className="size-1.5 rounded-full bg-accent-primary" /> : null}
                </span>
            </span>
        </button>
    );
}

function Section({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: React.ReactNode }) {
    return (
        <section className="flex min-w-0 flex-col gap-1.5">
            <h3 className="flex items-center gap-2 px-1 text-sm font-semibold text-twilight-text-soft">
                <Icon size={15} aria-hidden="true" className="text-accent-primary" /> {title}
            </h3>
            <ul className="flex flex-col gap-1">{children}</ul>
        </section>
    );
}

/** A row in the day's view: opens its own panel beside the reset (never leaves it). */
function Row({ lead, title, onOpen }: { lead: React.ReactNode; title: string; onOpen: () => void }) {
    return (
        <li>
            <button type="button" onClick={onOpen}
                className="surface-row group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                {lead}
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-twilight-text">{title}</span>
                <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-twilight-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-60" />
            </button>
        </li>
    );
}

function DayView({ day, today, onOpenTask, onOpenRoutine }: { day: Day; today: boolean; onOpenTask: (id: string) => void; onOpenRoutine: (id: string) => void }) {
    const empty = !day.blocks.length && !day.due.length && !day.routines.length;
    return (
        <div className="surface-card flex flex-col gap-5 rounded-3xl p-5 @3xl:p-6">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-twilight-text">
                    {today ? "Today" : formatWeekdayLong(day.day)} <span className="font-sans text-base font-normal text-twilight-text-soft">{formatShortDate(day.day)}</span>
                </h2>
                <p className="flex items-center gap-3 text-sm text-twilight-text-soft">
                    <Stat icon={Clock} value={`${hm(day.openMinutes)} free`} />
                    {day.bookedMinutes ? <Stat icon={CalendarClock} value={`${hm(day.bookedMinutes)} planned`} /> : null}
                </p>
            </header>
            {empty ? (
                <p className="flex items-center gap-2 px-1 text-[0.9375rem] text-twilight-text-soft">
                    <Sun size={16} aria-hidden="true" className="text-accent-primary" /> Nothing planned. The day is yours.
                </p>
            ) : (
                <div className="grid gap-5 @3xl:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-5">
                        {day.blocks.length ? (
                            <Section icon={CalendarClock} title="Planned">
                                {day.blocks.map((t) => (
                                    <Row key={t.id} title={t.title} onOpen={() => onOpenTask(getTaskSeriesId(t))}
                                        lead={(
                                            <span className="w-16 shrink-0 whitespace-nowrap text-sm tabular-nums text-twilight-text-soft @xl:w-[9.75rem]">
                                                <span className="@xl:hidden">{formatTime(t.scheduledStart!)}</span>
                                                <span className="hidden @xl:inline">{formatChipTime(t.scheduledStart!, t.scheduledEnd)}</span>
                                            </span>
                                        )} />
                                ))}
                            </Section>
                        ) : null}
                        {day.due.length ? (
                            <Section icon={Flag} title="Due">
                                {day.due.map((t) => (
                                    <Row key={t.id} title={t.title} onOpen={() => onOpenTask(getTaskSeriesId(t))}
                                        lead={<Flag size={14} aria-hidden="true" className="shrink-0 text-accent-secondary" />} />
                                ))}
                            </Section>
                        ) : null}
                    </div>
                    {day.routines.length ? (
                        <section className="flex min-w-0 flex-col gap-2">
                            <h3 className="flex items-center gap-2 px-1 text-sm font-semibold text-twilight-text-soft">
                                <Flame size={15} aria-hidden="true" className="text-accent-primary" /> Routines
                            </h3>
                            {/* Routines read as a set, not a to-do list: wrapped chips in each routine's tone. */}
                            <ul className="flex flex-wrap gap-1.5">
                                {day.routines.map((h) => (
                                    <li key={h.id}>
                                        <button type="button" onClick={() => onOpenRoutine(h.id)}
                                            style={{ "--routine-tone": routineTone(h.colorAccent) } as CSSProperties}
                                            className="surface-control inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-sm text-twilight-text-soft hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                                            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--routine-tone)]" /> {h.title}
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

/**
 * The next 7 days: a tile each (free time, what's planned, what's due, routines), and the picked day's full view
 * below. Tasks and routines open their panel beside the reset, so looking never leaves it.
 */
export function WeekView({ room, onOpenTask, onOpenRoutine }: { room: Day[]; onOpenTask: (id: string) => void; onOpenRoutine: (id: string) => void }) {
    const [picked, setPicked] = useState(room[0]?.day);
    const reduced = useReducedMotionSetting();
    const day = room.find((d) => d.day === picked) ?? room[0];
    if (!day) return null;
    return (
        <div className="flex flex-col gap-4">
            <ol className="grid grid-cols-7 gap-1.5 @2xl:gap-2" aria-label="Your next 7 days">
                {room.map((d, i) => (
                    <li key={d.day} className="h-full"><DayTile day={d} today={i === 0} selected={d.day === day.day} onSelect={() => setPicked(d.day)} /></li>
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
                    <DayView day={day} today={day.day === room[0]!.day} onOpenTask={onOpenTask} onOpenRoutine={onOpenRoutine} />
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
