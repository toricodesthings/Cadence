import { useState } from "react";
import { useNavigate } from "react-router";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { CalendarDays, ChevronRight } from "lucide-react";
import { ScrollAreaWrapper } from "../shared/ScrollAreaWrapper";
import { DatePicker } from "../shared/DatePicker";
import { Button } from "../primitives/Button";
import { PLACE_DROP, dayLabel, useWeekLoad } from "./PlaceSheet";
import { formatTime, getWeekStart, parseLocalDate, toISODate } from "../../lib/utils/date-format";
import { toTaskDateOnly } from "../../lib/utils/task/task-scheduling";
import { loadWord } from "../../lib/utils/task/day-load";

/** 0–3 dots: free · light · steady · busy. */
const loadDots = (load: number) => (load === 0 ? 0 : load <= 2 ? 1 : load <= 5 ? 2 : 3);

/**
 * The Capture rail when nothing is selected: this week and next as a grid of
 * day tiles that captures and Ready tasks drop onto. Busy-ness is dots, words
 * only for the chosen day, so the panel reads as a calendar, not a report.
 */
export function HoldingPlannerPanel({ onSelectTask }: { onSelectTask?: (taskId: string) => void }) {
    const navigate = useNavigate();
    const todayIso = toISODate(new Date());
    const { tasks, loads } = useWeekLoad(getWeekStart(new Date()), true, 14);
    const [selected, setSelected] = useState(todayIso);
    const dragging = Boolean(useDndContext().active);
    const days = [...loads];
    const dayTasks = tasks.filter((t) => toTaskDateOnly(t.dueDate ?? t.scheduledStart) === selected);

    const week = (label: string, slice: typeof days) => (
        <section aria-label={label} className="space-y-2">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted">{label}</h3>
            <div className="grid grid-cols-7 gap-1.5">
                {slice.map(([iso, load]) => <DayTile key={iso} iso={iso} load={load} isToday={iso === todayIso}
                    isPast={iso < todayIso} isSelected={iso === selected} dragging={dragging} onSelect={() => setSelected(iso)} />)}
            </div>
        </section>
    );

    return (
        <div className="photo-shell-surface surface-shell flex h-full flex-col">
            {/* Header — mirrors the Cadence panel header so the two rail panes read
                as siblings (same height, font-display title, lantern-glow icon). */}
            <header className="flex h-(--shell-header-h) shrink-0 items-center gap-3 border-b border-twilight-border pl-4 pr-[calc(1rem+var(--rail-toggle-reserve,0px))]">
                <div className="flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/25 glow-lantern">
                    <CalendarDays size={17} />
                </div>
                <div className="min-w-0 leading-tight">
                    <h2 className="font-display text-lg font-semibold leading-tight tracking-tight text-twilight-text">Place</h2>
                    <span className="mt-0.5 block truncate text-[11px] font-medium leading-none text-twilight-text-muted">
                        {dragging ? "Drop on a day" : "Drag a capture or task onto a day"}
                    </span>
                </div>
            </header>

            <ScrollAreaWrapper>
                <div className="flex min-h-full flex-col gap-5 px-4 py-5">
                    {week("This week", days.slice(0, 7))}
                    {week("Next week", days.slice(7))}

                    <section aria-live="polite" className="rounded-3xl border border-twilight-border/35 bg-white/[0.02] p-4">
                        <div className="flex items-baseline justify-between gap-3">
                            <h3 className="font-display text-base font-semibold text-twilight-text">
                                {selected === todayIso ? "Today" : parseLocalDate(selected).toLocaleDateString(undefined, { weekday: "long" })}
                                <span className="ml-2 text-sm font-normal text-twilight-text-soft">{parseLocalDate(selected).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                            </h3>
                            <span className="text-xs text-twilight-text-muted">{loadWord(loads.get(selected) ?? 0)}</span>
                        </div>
                        {dayTasks.length ? (
                            <ul className="mt-3 space-y-0.5">
                                {dayTasks.map((task) => (
                                    <li key={task.id}>
                                        <Button variant="ghost" size="none" type="button" onClick={() => onSelectTask?.(task.id)}
                                            className="flex min-h-9 w-full justify-start gap-2.5 rounded-xl px-2 text-left font-sans text-sm font-normal text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text">
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary/70" aria-hidden="true" />
                                            <span className="min-w-0 flex-1 truncate">{task.title}</span>
                                            {task.scheduledStart && !task.isAllDay && <span className="shrink-0 text-xs text-twilight-text-muted">{formatTime(task.scheduledStart)}</span>}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="mt-2 text-sm text-twilight-text-muted">Nothing here yet.</p>}
                    </section>

                    <div className="mt-auto flex gap-2">
                        <DatePicker label="Pick a date" value={null} onChange={(date) => date && navigate(`/schedule?date=${date}`)} className="min-w-0 flex-1">
                            <Button type="button" variant="secondary" size="md" className="min-w-0 flex-1 rounded-2xl px-3 font-sans font-medium">
                                Pick a date…
                            </Button>
                        </DatePicker>
                        <Button type="button" variant="secondary" size="md" onClick={() => navigate(`/schedule?date=${selected}&view=week`)}
                            className="min-w-0 flex-1 gap-1 whitespace-nowrap rounded-2xl px-3 font-sans font-medium">
                            Schedule <ChevronRight size={14} aria-hidden="true" />
                        </Button>
                    </div>
                </div>
            </ScrollAreaWrapper>
        </div>
    );
}

function DayTile({ iso, load, isToday, isPast, isSelected, dragging, onSelect }: {
    iso: string; load: number; isToday: boolean; isPast: boolean; isSelected: boolean; dragging: boolean; onSelect: () => void;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: PLACE_DROP + iso, disabled: isPast });
    const date = parseLocalDate(iso);
    const dots = loadDots(load);
    const tone = isOver
        ? "scale-105 border-accent-primary bg-accent-primary/25 hover:bg-accent-primary/25"
        : isSelected
            ? "border-accent-primary/50 bg-accent-primary/15 hover:bg-accent-primary/20"
            : dragging && !isPast
                ? "border-dashed border-accent-primary/35 bg-white/[0.04]"
                : "border-twilight-border/30 bg-white/[0.02] hover:bg-white/[0.05]";
    return (
        <Button variant="ghost" size="none" ref={setNodeRef} type="button" onClick={onSelect} aria-pressed={isSelected}
            aria-label={`${dayLabel(iso)}, ${loadWord(load)}`}
            className={`flex aspect-[4/5] min-h-14 flex-col gap-1 rounded-2xl border transition-[transform,background-color,border-color] duration-150 active:scale-100 ${tone} ${isPast ? "opacity-40" : ""}`}>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? "text-accent-primary" : "text-twilight-text-muted"}`}>
                {date.toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
            <span className={`font-display text-lg font-semibold leading-none ${isToday ? "text-accent-primary" : "text-twilight-text"}`}>{date.getDate()}</span>
            <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                {Array.from({ length: dots }, (_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent-primary/75" />)}
            </span>
        </Button>
    );
}
