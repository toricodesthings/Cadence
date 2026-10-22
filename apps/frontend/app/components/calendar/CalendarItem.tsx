import {
    createContext,
    useContext,
    useEffect,
    type ButtonHTMLAttributes,
    type CSSProperties,
    type ReactElement,
} from "react";
import { Check, Trash2 } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { dayOf } from "@cadence/domain/time";
import * as ContextMenu from "../primitives/ContextMenu";
import { Tip } from "../primitives/Tooltip";
import { RoutineMark } from "../habits/RoutineMark";
import { useArchiveTask } from "../../hooks/tasks/use-archive-task";
import { useProjects } from "../../hooks/projects/use-projects";
import { useAllSections } from "../../hooks/sections/use-sections";
import { parseVirtualHabitId, type VirtualHabitTask } from "../../hooks/habits/use-virtual-habit-tasks";
import {
    getTaskRecurrenceSummary,
    getTaskSeriesId,
    isRecurringTask,
    isRecurringTaskInstance,
} from "../../lib/utils/task/task-scheduling";
import { itemEnd, scheduleKind } from "../../lib/utils/calendar/schedule-day";
import { formatChipTime, formatShortDateLabel } from "../../lib/utils/date-format";
import { weekdayName } from "../../lib/utils/calendar/calendar-math";
import { getUserZone } from "../../lib/utils/user-zone";
import { routineTone } from "../../lib/utils/habits";

export interface CalendarChipActions {
    complete?: (task: Task) => void;
    resolveRoutine?: (task: Task, status: "COMPLETED" | "SKIPPED" | "PENDING") => void;
    moveToTomorrow?: (task: Task) => void;
    pickDay?: (task: Task) => void;
    openInRoutines?: (habitId: string) => void;
}
export const CalendarChipActionsContext = createContext<CalendarChipActions>({});
export const CalendarHoverContext = createContext<{
    series: string | null;
    setSeries: (series: string | null) => void;
}>({ series: null, setSeries: () => {} });

export function seriesKeyOf(task: Task): string {
    return (task.isHabit ? parseVirtualHabitId(task.id)?.habitId : null) ?? getTaskSeriesId(task);
}

export function calendarTone(task: Task): string {
    const kind = scheduleKind(task);
    if (kind === "routine") return routineTone((task as VirtualHabitTask).habitColor);
    if (kind === "fixed") return "var(--color-moonlit)";
    const priorities = ["twilight-text-muted", "priority-low", "priority-medium", "priority-high", "priority-urgent"];
    return `var(--color-${priorities[task.priority ?? 0]})`;
}

/** One opacity decision: done/past and hover dimming never compound below 50%. */
export function useCalendarItemPresentation(tasks: readonly Task[]) {
    const { series } = useContext(CalendarHoverContext);
    const done = tasks.every((task) => task.state === "COMPLETE");
    const past = tasks.every(
        (task) => scheduleKind(task) !== "task" && task.scheduledStart && itemEnd(task).getTime() < Date.now(),
    );
    const matching = series !== null && tasks.some((task) => seriesKeyOf(task) === series);
    const dim = series !== null && !matching;
    const opacity = Math.max(0.5, (done ? 0.5 : past ? 0.7 : 1) * (dim ? 0.6 : 1));
    return {
        className: matching ? "ring-1 ring-[var(--calendar-tone)]" : "",
        style: { opacity, "--calendar-tone": calendarTone(tasks[0]) } as CSSProperties,
    };
}

/** The routine's kind mark is its check-off, including one particular time slot. */
export function RoutineRing({ task, size = 24 }: { task: Task; size?: number }) {
    const { resolveRoutine } = useContext(CalendarChipActionsContext);
    const done = task.state === "COMPLETE";
    const tone = calendarTone(task);
    return (
        <button
            type="button"
            data-no-dnd="true"
            aria-pressed={done}
            aria-label={done ? `Clear ${task.title}` : `Mark ${task.title} done`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                resolveRoutine?.(task, done ? "PENDING" : "COMPLETED");
            }}
            className="relative z-10 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full before:absolute before:-inset-1 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
            style={{
                width: size,
                height: size,
                color: tone,
                border: `1.5px solid color-mix(in srgb, ${tone} ${done ? 100 : 60}%, transparent)`,
                backgroundColor: done ? `color-mix(in srgb, ${tone} 22%, transparent)` : "transparent",
            }}
        >
            <RoutineMark emoji={(task as VirtualHabitTask).habitEmoji} size={Math.round(size * 0.42)} />
            {done ? (
                <Check
                    size={Math.round(size * 0.4)}
                    strokeWidth={3}
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -right-0.5 rounded-full bg-panel p-px"
                />
            ) : null}
        </button>
    );
}

/** A visible details path beside a check-off mark; also serves as a popover trigger. */
export const RoutineDetailsButton = ({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string } & { ref?: React.Ref<HTMLButtonElement> }) => (
    <Tip label={label}>
        <button
            {...props}
            type="button"
            aria-label={label}
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex h-6 min-w-5 shrink-0 cursor-pointer items-center justify-center rounded-full px-1 text-[11px] text-twilight-text-muted hover:bg-twilight-border/20 hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
        >
            {children ?? <span aria-hidden="true">…</span>}
        </button>
    </Tip>
);

/** "Routine · 7:00", "Fixed · Tue 9–10", "Task · due Mar 8": what it is and when. */
function chipKindLine(task: Task) {
    const kind = scheduleKind(task);
    const start = task.scheduledStart;
    const when = start ? formatChipTime(start, task.scheduledEnd) : null;
    if (kind === "routine") return `Routine${when ? ` · ${when}` : ""}`;
    if (kind === "fixed") {
        const day = start ? dayOf(start, getUserZone()) : task.dueDate;
        return `Fixed${day ? ` · ${weekdayName(day, "short")}` : ""}${when ? ` ${when}` : ""}`;
    }
    return `Task${when ? ` · ${when}` : task.dueDate ? ` · due ${formatShortDateLabel(task.dueDate)}` : ""}`;
}

function ChipHoverCard({ task, tasks }: { task: Task; tasks: readonly Task[] }) {
    const { setSeries } = useContext(CalendarHoverContext);
    const { data: projects } = useProjects();
    const sections = useAllSections(task.projectId && task.sectionId ? [task.projectId] : []);
    const key = seriesKeyOf(task);
    useEffect(() => {
        setSeries(key);
        return () => setSeries(null);
    }, [key, setSeries]);
    const kindLine = chipKindLine(task);
    const repeat = getTaskRecurrenceSummary(task)?.cadenceLabel;
    const list = projects?.find((project) => project.id === task.projectId)?.name;
    const section = sections.find((entry) => entry.id === task.sectionId)?.name;
    return (
        <div className="max-w-64 space-y-1 text-left">
            {tasks.map((entry) => (
                <div key={entry.id} className="flex items-start gap-1.5 font-medium">
                    {entry.isHabit ? <RoutineMark emoji={(entry as VirtualHabitTask).habitEmoji} size={12} /> : null}
                    <span className="whitespace-normal break-words">{entry.title}</span>
                </div>
            ))}
            <div className="text-twilight-text-muted tabular-nums">{kindLine}</div>
            {repeat ? <div className="text-twilight-text-muted">{repeat}</div> : null}
            {list ? (
                <div className="text-twilight-text-muted">
                    {list}
                    {section ? ` › ${section}` : ""}
                </div>
            ) : null}
        </div>
    );
}

/** Every calendar shape shares its preview and labelled menu; dragging suppresses the preview. */
export function CalendarItem({
    task,
    tasks = [task],
    onSelect,
    tipSide = "right",
    dragging = false,
    children,
}: {
    task: Task;
    tasks?: readonly Task[];
    onSelect: (id: string) => void;
    tipSide?: "left" | "right";
    dragging?: boolean;
    children: ReactElement;
}) {
    const archiveTask = useArchiveTask();
    const actions = useContext(CalendarChipActionsContext);
    const kind = scheduleKind(task);
    const done = task.state === "COMPLETE";
    const parts = task.isHabit ? parseVirtualHabitId(task.id) : null;
    const isSeries = isRecurringTask(task) || isRecurringTaskInstance(task);
    const trigger = (
        <ContextMenu.Trigger asChild onContextMenu={(e) => e.stopPropagation()}>
            {children}
        </ContextMenu.Trigger>
    );
    return (
        <ContextMenu.Root>
            <Tip label={<ChipHoverCard task={task} tasks={tasks} />} side={tipSide} disabled={dragging}>
                {trigger}
            </Tip>
            <ContextMenu.Content onClick={(e) => e.stopPropagation()}>
                <ContextMenu.Item onSelect={() => onSelect(task.id)}>Open details</ContextMenu.Item>
                {kind === "routine" ? (
                    <>
                        <ContextMenu.Item onSelect={() => actions.resolveRoutine?.(task, "COMPLETED")} disabled={done}>
                            Done
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => actions.resolveRoutine?.(task, "SKIPPED")}>
                            Skip
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => actions.resolveRoutine?.(task, "PENDING")}>
                            Clear
                        </ContextMenu.Item>
                        {parts ? (
                            <>
                                <ContextMenu.Separator />
                                <ContextMenu.Item onSelect={() => actions.openInRoutines?.(parts.habitId)}>
                                    Open in Routines
                                </ContextMenu.Item>
                            </>
                        ) : null}
                    </>
                ) : (
                    <>
                        {kind === "task" ? (
                            <>
                                <ContextMenu.Item onSelect={() => actions.complete?.(task)} disabled={done}>
                                    Done
                                </ContextMenu.Item>
                                <ContextMenu.Item onSelect={() => actions.moveToTomorrow?.(task)}>
                                    Move to tomorrow
                                </ContextMenu.Item>
                                <ContextMenu.Item onSelect={() => actions.pickDay?.(task)}>Pick day…</ContextMenu.Item>
                                <ContextMenu.Separator />
                            </>
                        ) : (
                            <ContextMenu.Separator />
                        )}
                        <ContextMenu.Item
                            variant="danger"
                            disabled={archiveTask.isPending}
                            onSelect={() => archiveTask.mutate(getTaskSeriesId(task))}
                            className="gap-2"
                        >
                            <Trash2 size={16} aria-hidden="true" />
                            {isSeries ? "Move series to Trash" : "Move to Trash"}
                        </ContextMenu.Item>
                    </>
                )}
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}
