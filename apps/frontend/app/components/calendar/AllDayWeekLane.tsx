import { useMemo } from "react";
import type { LocalDate } from "@cadence/domain/time";
import type { Task } from "@cadence/contracts/task";
import * as Popover from "../primitives/Popover";
import { AllDayDropLane, AllDayDropPreview } from "./CalendarDropTargets";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { RoutineStrip } from "./RoutineChips";
import { buildAllDayWeekLayout } from "../../lib/utils/calendar/all-day-layout";
import type { CalendarDropPreview } from "../../lib/utils/calendar/calendar-dnd";

/** At 640px the lane may only take one row: the hour grid is what the screen is for. */
const SHORT_HIDDEN = "[@media(max-height:760px)]:hidden";
const SHORT_INLINE = "hidden [@media(max-height:760px)]:inline";
const SHORT_CONTENTS = "hidden [@media(max-height:760px)]:contents";

/**
 * Week's all-day lane on one 7-column grid: multi-day items are one bar across their days, one-off tasks fill
 * the rows beneath in their own column, anytime routines fold into a strip of marks per day.
 */
export function AllDayWeekLane({
    weekDates,
    tasksByDate,
    todayStr,
    activeDropPreview,
    onSelectTask,
}: {
    weekDates: LocalDate[];
    tasksByDate: Record<string, Task[]>;
    todayStr: LocalDate;
    activeDropPreview?: CalendarDropPreview | null;
    onSelectTask: (id: string) => void;
}) {
    const { shownBars, days, rows, anytime } = useMemo(
        () => buildAllDayWeekLayout(weekDates, tasksByDate),
        [weekDates, tasksByDate],
    );
    const moreRow = rows + 1;
    const stripRow = rows + 2;
    const pill = (task: Task, day: LocalDate) => (
        <CalendarTaskChip key={task.id} task={task} variant="pill" sourceId={`allday-${day}`} onSelect={onSelectTask} />
    );

    return (
        <div className="grid min-h-2 min-w-0 flex-1 grid-cols-7 gap-y-[2px] pb-1.5">
            {/* One drop lane per day under everything, spanning every row */}
            {weekDates.map((day, index) => (
                <AllDayDropLane
                    key={`lane-${day}`}
                    dateStr={day}
                    style={{ gridColumn: index + 1, gridRow: `1 / span ${stripRow}` }}
                    className={`rounded-none border-l border-twilight-border/20 ${day === todayStr ? "calendar-today-column" : ""}`}
                    isActive={activeDropPreview?.kind === "allday" && activeDropPreview.dateStr === day}
                >
                    {activeDropPreview?.kind === "allday" && activeDropPreview.dateStr === day ? (
                        <AllDayDropPreview preview={activeDropPreview} />
                    ) : null}
                </AllDayDropLane>
            ))}

            {shownBars.map((bar) => (
                <div
                    key={bar.task.id}
                    className={`relative min-w-0 px-1 ${bar.row > 0 ? SHORT_HIDDEN : ""} ${bar.clippedStart ? "[&>*]:rounded-l-md" : ""} ${bar.clippedEnd ? "[&>*]:rounded-r-md" : ""}`}
                    style={{ gridColumn: `${bar.from + 1} / ${bar.to + 2}`, gridRow: bar.row + 1 }}
                >
                    {pill(bar.task, weekDates[bar.from])}
                </div>
            ))}

            {days.map((day, index) =>
                day.shown.map(({ task, row }) => (
                    <div
                        key={task.id}
                        className={`relative min-w-0 px-1 ${row > 0 ? SHORT_HIDDEN : ""}`}
                        style={{ gridColumn: index + 1, gridRow: row + 1 }}
                    >
                        {pill(task, weekDates[index])}
                    </div>
                )),
            )}

            {days.map((day, index) => {
                const tall = day.overflow.length;
                const short = tall + day.secondRow.length;
                if (short === 0) return null;
                return (
                    <div
                        key={`more-${weekDates[index]}`}
                        className={`relative min-w-0 px-1 ${tall === 0 ? "[@media(min-height:761px)]:hidden" : ""}`}
                        style={{ gridColumn: index + 1, gridRow: moreRow }}
                    >
                        <Popover.Root>
                            <Popover.Trigger asChild>
                                <button
                                    type="button"
                                    aria-label={`More tasks for ${weekDates[index]}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="cursor-pointer rounded-lg px-1 py-0.5 text-[10px] leading-none text-twilight-text-muted transition-colors hover:bg-twilight-border/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 hover:text-twilight-text"
                                >
                                    <span className={SHORT_HIDDEN}>+{tall} more</span>
                                    <span className={SHORT_INLINE}>+{short} more</span>
                                </button>
                            </Popover.Trigger>
                            <Popover.Content side="bottom" align="start" className="flex w-64 flex-col gap-[3px] p-2">
                                <div className={SHORT_CONTENTS}>
                                    {day.secondRow.map((task) => pill(task, weekDates[index]))}
                                </div>
                                {day.overflow.map((task) => pill(task, weekDates[index]))}
                            </Popover.Content>
                        </Popover.Root>
                    </div>
                );
            })}

            {anytime.map((tasks, index) =>
                tasks.length ? (
                    <div
                        key={`strip-${weekDates[index]}`}
                        className="relative min-w-0 px-1"
                        style={{ gridColumn: index + 1, gridRow: stripRow }}
                    >
                        <RoutineStrip tasks={tasks} onSelect={onSelectTask} tipSide={index >= 5 ? "left" : "right"} />
                    </div>
                ) : null,
            )}
        </div>
    );
}
