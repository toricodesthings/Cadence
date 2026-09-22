import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useDraggable } from "@dnd-kit/core";
import { Check, CalendarDays, ArrowRight } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { AgendaRow } from "../../shared/AgendaRow";
import { RoutineAgendaRow } from "../../shared/RoutineAgendaRow";
import { TaskCheckbox } from "../../tasks/TaskCheckbox";
import { formatTime, getEffectiveTaskDate, toISODate } from "../../../lib/utils/date-format";
import { isTimed, scheduleKind } from "../../../lib/utils/calendar/schedule-day";
import { isRecurringTask, isRecurringTaskInstance } from "../../../lib/utils/task/task-scheduling";

/** Past this, a release commits; a flick past `FLICK` commits sooner. */
const COMMIT = 88;
const FLICK = 520;
const ACTIONS_WIDTH = 176;

export interface ScheduleRowHandlers {
    onOpen: (task: Task) => void;
    /** Task: queue completion. Routine: toggle today's check-in. */
    onComplete: (task: Task) => void | Promise<unknown>;
    /** Move to the next day: tomorrow for today's rows. */
    onLater: (task: Task) => void;
    onPickDay: (task: Task) => void;
}

export interface ScheduleRowProps extends ScheduleRowHandlers {
    task: Task;
    routineEmoji?: string | null;
    /** Faded: already behind "now" on today. */
    past?: boolean;
    /** A task is being dragged somewhere: swipes stand down so dnd-kit keeps the finger. */
    dragActive?: boolean;
    reducedMotion?: boolean;
}

function timeRange(task: Task) {
    if (!isTimed(task)) return null;
    const start = formatTime(task.scheduledStart!);
    return task.scheduledEnd ? `${start} – ${formatTime(task.scheduledEnd)}` : start;
}

/**
 * One scheduled thing, drawn as what it is: a fixed block (no check), a routine
 * (its mark and a light check-in) or a task (the task checkbox). Tasks swipe
 * right to finish and left for Tomorrow / Pick day; routines swipe right to
 * check in. Every swipe has a tap path too: the check, and the detail sheet.
 */
export function ScheduleRow({ task, routineEmoji, past = false, dragActive = false, reducedMotion = false, onOpen, onComplete, onLater, onPickDay }: ScheduleRowProps) {
    const kind = scheduleKind(task);
    const done = task.state === "COMPLETE";
    const movable = kind === "task" && !isRecurringTask(task) && !isRecurringTaskInstance(task);
    const canSwipeRight = kind !== "fixed" && !done;
    const [actionsOpen, setActionsOpen] = useState(false);
    /** A swipe ends in a click on the row; that click isn't a tap. */
    const swiped = useRef(false);
    const x = useMotionValue(0);
    const doneOpacity = useTransform(x, [0, COMMIT], [0, 1]);
    const actionsOpacity = useTransform(x, [-ACTIONS_WIDTH, -24, 0], [1, 0.4, 0]);

    // Long-press lifts a task onto the week strip. Touch only: a mouse drag is the swipe.
    const { setNodeRef, listeners, isDragging } = useDraggable({
        id: `phone-row-${task.id}`,
        data: { taskId: task.id },
        disabled: !movable,
    });

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        const { offset, velocity } = info;
        swiped.current = true;
        window.setTimeout(() => { swiped.current = false; }, 0);
        if (canSwipeRight && (offset.x > COMMIT || (velocity.x > FLICK && offset.x > 24))) {
            void onComplete(task);
            setActionsOpen(false);
            return;
        }
        if (movable) setActionsOpen(offset.x < -COMMIT / 2 || (velocity.x < -FLICK && offset.x < -12));
        else setActionsOpen(false);
    };

    const open = () => {
        if (swiped.current) return;
        if (actionsOpen) setActionsOpen(false);
        else onOpen(task);
    };

    const meta = timeRange(task);
    const anchor = task.scheduledStart ?? task.dueDate;
    const laterLabel = !anchor || getEffectiveTaskDate(anchor, task.isAllDay) <= toISODate(new Date()) ? "Tomorrow" : "Next day";
    let row;
    if (kind === "routine") {
        row = (
            <RoutineAgendaRow
                title={task.title}
                emoji={routineEmoji}
                timeLabel={meta}
                done={done}
                onOpen={open}
                onComplete={() => onComplete(task)}
            />
        );
    } else {
        row = (
            <AgendaRow
                leading={kind === "fixed" ? (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden="true">
                        <span className="h-8 w-1 rounded-full bg-moonlit/70" />
                    </span>
                ) : (
                    <TaskCheckbox task={task} />
                )}
                onOpen={open}
                ariaLabel={`Open ${kind === "fixed" ? "fixed block" : "task"} ${task.title}${meta ? `, ${meta}` : ""}`}
                className={`items-center py-1.5 ${kind === "fixed" ? "hover:bg-moonlit/[0.05]" : "hover:bg-white/[0.04]"}`}
            >
                <span className="block truncate text-[15px] leading-snug text-twilight-text">{task.title}</span>
                {meta ? (
                    <span className={`block text-[12px] tabular-nums ${kind === "fixed" ? "text-moonlit" : "text-twilight-text-soft"}`}>
                        {meta}
                    </span>
                ) : null}
            </AgendaRow>
        );
    }

    const swipeable = (canSwipeRight || movable) && !dragActive;

    return (
        <div
            ref={setNodeRef}
            onTouchStart={listeners?.onTouchStart as React.TouchEventHandler<HTMLDivElement> | undefined}
            data-dnd-draggable={movable ? "true" : undefined}
            className={`relative overflow-hidden rounded-[26px] transition-opacity ${past || isDragging ? "opacity-55" : ""}`}
        >
            {canSwipeRight ? (
                <motion.div
                    aria-hidden="true"
                    style={{ opacity: doneOpacity }}
                    className="absolute inset-0 flex items-center rounded-[26px] bg-accent-primary/15 pl-5 text-accent-primary"
                >
                    <Check size={18} />
                </motion.div>
            ) : null}
            {movable ? (
                <motion.div
                    style={{ opacity: actionsOpacity }}
                    className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-2"
                    // Hidden from the a11y tree while closed; the detail sheet holds the same actions.
                    aria-hidden={!actionsOpen}
                >
                    <button
                        type="button"
                        tabIndex={actionsOpen ? 0 : -1}
                        onClick={() => { setActionsOpen(false); onLater(task); }}
                        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-2xl bg-white/[0.07] px-3 text-[13px] font-medium text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <ArrowRight size={14} aria-hidden="true" />
                        {laterLabel}
                    </button>
                    <button
                        type="button"
                        tabIndex={actionsOpen ? 0 : -1}
                        onClick={() => { setActionsOpen(false); onPickDay(task); }}
                        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-2xl bg-white/[0.07] px-3 text-[13px] font-medium text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <CalendarDays size={14} aria-hidden="true" />
                        Pick day
                    </button>
                </motion.div>
            ) : null}
            <motion.div
                drag={swipeable ? "x" : false}
                dragDirectionLock
                dragConstraints={{ left: movable ? -ACTIONS_WIDTH : 0, right: 0 }}
                dragElastic={reducedMotion ? 0 : { left: 0.08, right: canSwipeRight ? 0.6 : 0 }}
                dragMomentum={false}
                onDragStart={() => { swiped.current = true; }}
                onDragEnd={handleDragEnd}
                animate={{ x: actionsOpen ? -ACTIONS_WIDTH : 0 }}
                transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
                style={{ x }}
                className="relative rounded-[26px]"
            >
                {row}
            </motion.div>
        </div>
    );
}
