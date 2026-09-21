import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { DndContext, DragOverlay, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { MouseSensor } from "../../lib/utils/dnd";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { UtilitySheet } from "../shared/UtilitySheet";
import { TaskCard } from "../tasks/TaskCard";
import { Button } from "../primitives/Button";
import { useTasks } from "../../hooks/tasks/use-tasks";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { addDays, parseLocalDate, toISODate } from "../../lib/utils/date-format";
import { toTaskDateOnly } from "../../lib/utils/task/task-scheduling";
import { dayLoads, lightestDay, loadWord } from "../../lib/utils/task/day-load";

export const dayLabel = (iso: string) => parseLocalDate(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** Active dated tasks for `days` days from `start`, their effort-weighted loads, and the lightest of the first week. */
export function useWeekLoad(start: Date, enabled = true, days = 7) {
    const { data: tasks = [] } = useTasks({ state: "ACTIVE", scheduledRange: { start: toISODate(start), end: toISODate(addDays(start, days - 1)) }, enabled });
    const loads = dayLoads(tasks, start, days);
    return { tasks, loads, lightest: lightestDay(new Map([...loads].slice(0, 7)))! };
}

/** Drop-target id prefix for a placement day: `place:YYYY-MM-DD`. */
export const PLACE_DROP = "place:";

type PlaceDragData = { title: string; onPlace: (iso: string) => void };

/** Desktop Capture: lets captures and Ready tasks be dragged onto the Place rail's days. */
export function PlaceDndProvider({ children }: { children: ReactNode }) {
    const [active, setActive] = useState<string | null>(null);
    const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));
    return (
        <DndContext sensors={sensors}
            onDragStart={(e) => setActive((e.active.data.current as PlaceDragData | undefined)?.title ?? null)}
            onDragCancel={() => setActive(null)}
            onDragEnd={({ active: drag, over }) => {
                setActive(null);
                const id = String(over?.id ?? "");
                if (id.startsWith(PLACE_DROP)) (drag.data.current as PlaceDragData | undefined)?.onPlace(id.slice(PLACE_DROP.length));
            }}>
            {children}
            <DragOverlay dropAnimation={null}>
                {active && <div className="max-w-xs cursor-grabbing truncate rounded-2xl border border-accent-primary/40 bg-twilight-surface px-4 py-2.5 text-sm font-medium text-twilight-text shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-md">{active}</div>}
            </DragOverlay>
        </DndContext>
    );
}

export function PlaceDraggable({ id, title, onPlace, className = "", children }: { id: string; className?: string; children: ReactNode } & PlaceDragData) {
    const { setNodeRef, listeners, isDragging } = useDraggable({ id, data: { title, onPlace } satisfies PlaceDragData });
    return <div ref={setNodeRef} {...listeners} data-dnd-draggable="true" className={`${className} ${isDragging ? "opacity-40" : ""}`}>{children}</div>;
}

/** Gives a task a deadline on `iso`, with Undo — placing should never feel final. */
export function usePlaceTask() {
    const updateTask = useUpdateTask();
    return (task: Task, iso: string) => {
        const clear = { scheduledStart: null, scheduledEnd: null, isAllDay: true };
        updateTask.mutate({ id: task.id, dueDate: iso, ...clear });
        toast(`Placed on ${dayLabel(iso)}`, { action: { label: "Undo", onClick: () => updateTask.mutate({ id: task.id, dueDate: null, ...clear }) } });
    };
}

const CHIP = "touch-target inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium";
const CHIP_IDLE = "border-twilight-border/40 bg-white/[0.03] text-twilight-text-soft";
const CHIP_HINT = "border-accent-primary/30 bg-accent-primary/14 text-accent-primary";

/** One-tap placement under a Ready task: Today · Tomorrow · lightest day (accented) · Pick day. */
export function PlaceChips({ task, lightest, onPick, className = "" }: { task: Task; lightest: string; onPick: () => void; className?: string }) {
    const place = usePlaceTask();
    const today = toISODate(new Date());
    const tomorrow = toISODate(addDays(new Date(), 1));
    const chip = (iso: string, label: string) => (
        <button key={iso} type="button" onClick={() => place(task, iso)} className={`${CHIP} ${iso === lightest ? CHIP_HINT : CHIP_IDLE}`}
            aria-label={`Place ${task.title} on ${dayLabel(iso)}${iso === lightest ? ", lightest day" : ""}`} title={iso === lightest ? "Lightest day this week" : undefined}>
            {label}
        </button>
    );
    return (
        <div data-no-dnd="true" className={`-mt-1 mb-2 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hidden ${className}`}>
            {chip(today, "Today")}
            {chip(tomorrow, "Tomorrow")}
            {lightest !== today && lightest !== tomorrow && chip(lightest, dayLabel(lightest))}
            <button type="button" onClick={onPick} className={`${CHIP} ${CHIP_IDLE}`}><CalendarDays size={12} aria-hidden="true" />Pick day…</button>
        </div>
    );
}

/**
 * "Pick a day" sheet (a bottom sheet on compact, a side panel on desktop). With a task it places that task; without one it
 * browses days and hands off to Schedule. Busy-ness is shown as bars and words,
 * never counts, so a full week doesn't read as a wall of numbers.
 */
export function PlaceSheet({ open, task, onClose, onOpenTask }: { open: boolean; task: Task | null; onClose: () => void; onOpenTask: (taskId: string) => void }) {
    const navigate = useNavigate();
    const place = usePlaceTask();
    const todayIso = toISODate(new Date());
    const [stripStart, setStripStart] = useState(() => parseLocalDate(todayIso));
    const [picked, setPicked] = useState<string | null>(null);
    const { tasks, loads, lightest } = useWeekLoad(stripStart, open);
    const selected = picked ?? (task && stripStart.getTime() === parseLocalDate(todayIso).getTime() ? lightest : toISODate(stripStart));
    const dayTasks = tasks.filter((t) => toTaskDateOnly(t.dueDate ?? t.scheduledStart) === selected);

    const close = () => { onClose(); setPicked(null); setStripStart(parseLocalDate(todayIso)); };
    const jump = (iso: string) => { setStripStart(parseLocalDate(iso)); setPicked(iso); };
    const shift = (days: number) => { const next = addDays(stripStart, days); setStripStart(next); setPicked(toISODate(next)); };

    const band = (
        <div className="shrink-0 space-y-3 border-b border-twilight-border px-4 py-3">
            <div className="flex items-center gap-2">
                {/* Transparent native date input over the label: the OS picker handles far-off dates. */}
                <label className="relative min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate font-display text-lg font-semibold text-twilight-text">{dayLabel(selected)}</span>
                    <span className="text-sm text-twilight-text-soft">{loadWord(loads.get(selected) ?? 0)} day · tap to pick a date</span>
                    <input type="date" value={selected} onChange={(e) => e.target.value && jump(e.target.value)} aria-label="Pick a date" className="absolute inset-0 opacity-0" />
                </label>
                {selected !== todayIso && <button type="button" onClick={() => jump(todayIso)} className={`${CHIP} ${CHIP_IDLE}`}>Today</button>}
            </div>

            <div className="flex items-center gap-1">
                <button type="button" onClick={() => shift(-7)} aria-label="Previous week" className="mobile-icon-button shrink-0"><ChevronLeft size={18} aria-hidden="true" /></button>
                <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
                    onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 50) shift(info.offset.x < 0 ? 7 : -7); }}
                    className="grid flex-1 grid-cols-7 gap-1 touch-pan-y">
                    {[...loads].map(([iso, load]) => {
                        const d = parseLocalDate(iso);
                        const isSel = iso === selected;
                        return (
                            <button key={iso} type="button" onClick={() => setPicked(iso)} aria-pressed={isSel}
                                aria-label={`${dayLabel(iso)}, ${loadWord(load)}`}
                                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-twilight-text transition-colors ${
                                    isSel ? "bg-accent-primary text-twilight-void" : iso === todayIso ? "ring-1 ring-accent-primary/50" : "hover:bg-white/[0.05]"}`}>
                                <span className={`text-[10px] font-semibold uppercase ${isSel ? "" : "text-twilight-text-muted"}`}>{d.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                                <span className="text-base font-semibold">{d.getDate()}</span>
                                <span aria-hidden="true" className={`h-1 rounded-full ${isSel ? "bg-twilight-void/60" : "bg-accent-primary/70"}`}
                                    style={{ width: `${Math.min(load, 6) * 3}px` }} />
                            </button>
                        );
                    })}
                </motion.div>
                <button type="button" onClick={() => shift(7)} aria-label="Next week" className="mobile-icon-button shrink-0"><ChevronRight size={18} aria-hidden="true" /></button>
            </div>
        </div>
    );

    const footer = (
        <div className="border-t border-twilight-border px-4 pb-4 pt-3">
            {task
                ? <Button type="button" className="min-h-12 w-full" onClick={() => { place(task, selected); close(); }}>Place on {dayLabel(selected)}</Button>
                : <Button type="button" variant="secondary" className="min-h-12 w-full" onClick={() => { close(); navigate(`/schedule?date=${selected}`); }}>Open in Schedule</Button>}
        </div>
    );

    return (
        <UtilitySheet title={task ? `Place “${task.title}”` : "Pick a day"} open={open} onClose={close} band={band} footer={footer}>
            <section aria-label={`On ${dayLabel(selected)}`} className="space-y-2">
                <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted">On {dayLabel(selected)}</h3>
                {dayTasks.length
                    ? <div className="flex flex-col gap-0.5">{dayTasks.map((t) => <TaskCard key={t.id} task={t} onSelect={(id) => { close(); onOpenTask(id); }} />)}</div>
                    : <p className="px-1 py-6 text-sm text-twilight-text-soft">Nothing here yet — room to breathe.</p>}
            </section>
        </UtilitySheet>
    );
}
