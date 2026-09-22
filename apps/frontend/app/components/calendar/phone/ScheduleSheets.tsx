import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { UtilitySheet } from "../../shared/UtilitySheet";
import { Button } from "../../primitives/Button";
import { dayLabel, usePlaceTask } from "../../holding/PlaceSheet";

/** Holding's Ready tasks, placed onto the day you're looking at with one tap each. */
export function ReadyToPlaceSheet({ open, dateIso, tasks, onClose }: { open: boolean; dateIso: string; tasks: Task[]; onClose: () => void }) {
    const place = usePlaceTask();
    return (
        <UtilitySheet title={`Place on ${dayLabel(dateIso)}`} subtitle="Ready tasks from Holding" open={open} onClose={onClose}>
            {tasks.length === 0 ? (
                <p className="px-1 py-6 text-sm text-twilight-text-soft">Nothing is waiting to be placed.</p>
            ) : (
                <ul className="flex flex-col gap-1">
                    {tasks.map((task) => (
                        <li key={task.id} className="flex min-h-12 items-center gap-3 rounded-2xl px-2">
                            <span className="min-w-0 flex-1 truncate text-[15px] text-twilight-text">{task.title}</span>
                            <Button type="button" variant="cardPrimary" size="sm" className="shrink-0" onClick={() => place(task, dateIso)}>
                                Place
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </UtilitySheet>
    );
}

/**
 * Relief for a heavy day: today's open tasks, all chosen, moved in one step to
 * tomorrow or off the calendar (dates cleared), with one Undo. Fixed blocks and routines are
 * never offered; they aren't owed. Nothing moves until the user taps.
 */
export function LightenTodaySheet({ open, tasks, onClose, onMove }: {
    open: boolean;
    tasks: Task[];
    onClose: () => void;
    onMove: (tasks: Task[], to: "tomorrow" | "holding") => void;
}) {
    const [chosen, setChosen] = useState<Set<string>>(() => new Set());
    useEffect(() => {
        if (open) setChosen(new Set(tasks.map((task) => task.id)));
        // Re-seed only when the sheet opens; later list changes keep the user's picks.
    }, [open]);

    const picked = tasks.filter((task) => chosen.has(task.id));
    const toggle = (id: string) => setChosen((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    const move = (to: "tomorrow" | "holding") => {
        onMove(picked, to);
        onClose();
    };

    const footer = (
        <div className="grid grid-cols-2 gap-2 border-t border-twilight-border px-4 pb-4 pt-3">
            <Button type="button" variant="secondary" className="min-h-12" disabled={picked.length === 0} onClick={() => move("holding")}>
                Clear the date
            </Button>
            <Button type="button" className="min-h-12" disabled={picked.length === 0} onClick={() => move("tomorrow")}>
                Move to tomorrow
            </Button>
        </div>
    );

    return (
        <UtilitySheet title="Lighten today" subtitle="Choose what can wait. You can undo this." open={open} onClose={onClose} footer={footer}>
            <ul className="flex flex-col gap-1">
                {tasks.map((task) => {
                    const on = chosen.has(task.id);
                    return (
                        <li key={task.id}>
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                onClick={() => toggle(task.id)}
                                className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl px-2 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                            >
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-[1.5px] transition-colors ${on ? "border-accent-primary bg-accent-primary text-twilight-void" : "border-twilight-text-muted/70"}`}>
                                    {on ? <Check size={14} aria-hidden="true" /> : null}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[15px] text-twilight-text">{task.title}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </UtilitySheet>
    );
}
