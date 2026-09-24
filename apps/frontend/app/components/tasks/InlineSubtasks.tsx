import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import type { Subtask } from "@cadence/contracts/subtask";
import { useCreateSubtask, useDeleteSubtask, useReorderSubtasks } from "../../hooks/tasks/use-subtasks";
import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";
import { SortableSubtaskList, type SortableSubtaskRenderProps } from "./SortableSubtaskList";
import { TaskCheckbox } from "./TaskCheckbox";
import { useSubtaskOpenStore } from "../../stores/subtask-open-store";

/**
 * A row's subtasks, as on task cards: a quiet toggle line that opens the subtasks as a tree beneath it.
 * Rows own the adding state so a menu's "Add subtask" can open the panel straight into the input;
 * open/closed is remembered per task across reloads.
 */

export function useInlineSubtasks(taskId: string) {
    const open = useSubtaskOpenStore((state) => !!state.open[taskId]);
    const setOpen = useSubtaskOpenStore((state) => state.setOpen);
    const [adding, setAdding] = useState(false);
    return {
        open,
        adding,
        toggle: () => setOpen(taskId, !open),
        startAdding: () => {
            setOpen(taskId, true);
            setAdding(true);
        },
        setAdding,
    };
}

/** The thread from a task's checkbox down past its open subtasks; rows place it under their own checkbox. */
export const SUBTASK_RAIL = "pointer-events-none w-px bg-gradient-to-b from-white/[0.14] via-white/[0.08] to-transparent";

const byOrder = (subtasks: Subtask[]) => [...subtasks].sort((a, b) => a.orderIndex - b.orderIndex);

/**
 * Chevron, progress bar, "done/total subtasks" and the next open one — plain text, not a pill, so it
 * never reads as metadata. Turns green with a tick once every subtask is done.
 */
export function SubtaskChip({
    subtasks,
    open,
    onToggle,
    controls,
}: {
    subtasks: Subtask[];
    open: boolean;
    onToggle: () => void;
    /** id of the panel it opens, for aria-controls */
    controls?: string;
}) {
    if (!subtasks.length) return null;
    const done = subtasks.filter((s) => s.isComplete).length;
    const allDone = done === subtasks.length;
    const next = open ? undefined : byOrder(subtasks).find((s) => !s.isComplete);
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onToggle();
            }}
            data-no-dnd="true"
            data-no-open="true"
            aria-expanded={open}
            aria-controls={controls}
            aria-label={`${open ? "Hide" : "Show"} subtasks, ${done} of ${subtasks.length} done`}
            className="-mx-1.5 flex min-h-9 w-[calc(100%+0.75rem)] min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-left text-[12px] font-medium tabular-nums text-twilight-text-soft transition-colors hover:bg-white/[0.03] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
            <ChevronRight
                size={13}
                aria-hidden="true"
                className={`shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            />
            {allDone ? (
                <Check size={13} aria-hidden="true" className="shrink-0 text-feedback-success" />
            ) : (
                <span className="flex h-1.5 w-6 shrink-0 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                    <span
                        className="h-full rounded-full bg-feedback-success/60 transition-all duration-300"
                        style={{ width: `${(done / subtasks.length) * 100}%` }}
                    />
                </span>
            )}
            <span aria-hidden="true" className={`shrink-0 ${allDone ? "text-feedback-success" : ""}`}>
                {done}/{subtasks.length} subtasks
            </span>
            {next ? (
                <span aria-hidden="true" className="min-w-0 truncate font-normal text-twilight-text-muted">
                    · Next: {next.title}
                </span>
            ) : null}
        </button>
    );
}

function InlineSubtaskItem({
    subtask,
    onDelete,
    dragHandleProps,
    isDragging,
}: {
    subtask: Subtask;
    onDelete: (id: string) => void;
    dragHandleProps: SortableSubtaskRenderProps["dragHandleProps"];
    isDragging: boolean;
}) {
    const coarse = useIsCoarsePointer();
    const reveal = coarse ? "opacity-100" : "opacity-0 group-hover/sub:opacity-100 group-focus-within/sub:opacity-100";
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className={`group/sub flex items-center gap-1.5 rounded-xl px-1 py-0.5 transition-colors hover:bg-white/[0.03] ${
                isDragging ? "opacity-50" : "opacity-100"
            }`}
        >
            <div
                ref={dragHandleProps.ref}
                {...dragHandleProps.attributes}
                {...dragHandleProps.listeners}
                className={`relative shrink-0 cursor-grab rounded-lg p-0.5 text-twilight-text-soft transition-opacity ${reveal}`}
                data-no-dnd="true"
                data-no-open="true"
                aria-label="Drag to reorder subtask"
            >
                <GripVertical size={14} aria-hidden="true" />
            </div>
            <TaskCheckbox subtask={subtask} compact />
            <span
                className={`min-w-0 flex-1 text-[13px] leading-5 transition-colors ${
                    subtask.isComplete ? "text-twilight-text-muted/40 line-through" : "text-twilight-text-soft"
                }`}
            >
                {subtask.title}
            </span>
            <button
                type="button"
                onClick={() => onDelete(subtask.id)}
                data-no-dnd="true"
                data-no-open="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-red-400/70 transition-[opacity,color,background-color] hover:bg-red-500/10 hover:text-red-300 ${reveal}`}
                aria-label={`Delete subtask ${subtask.title}`}
            >
                <X size={14} aria-hidden="true" />
            </button>
        </motion.div>
    );
}

/** The panel the chip opens: the sortable list, then the add input or an "Add subtask" row. */
export function InlineSubtaskPanel({
    id,
    taskId,
    subtasks,
    open,
    adding,
    onAddingChange,
}: {
    id?: string;
    taskId: string;
    subtasks: Subtask[];
    open: boolean;
    adding: boolean;
    onAddingChange: (adding: boolean) => void;
}) {
    const createSubtask = useCreateSubtask(taskId);
    const deleteSubtask = useDeleteSubtask(taskId);
    const reorderSubtask = useReorderSubtasks(taskId);
    const [title, setTitle] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const ordered = byOrder(subtasks);

    useEffect(() => {
        if (adding) inputRef.current?.focus();
    }, [adding]);

    const stopAdding = () => {
        onAddingChange(false);
        setTitle("");
    };
    const submit = () => {
        const value = title.trim();
        if (!value) return stopAdding();
        const orderIndex = ordered.length ? ordered[ordered.length - 1].orderIndex + 1 : 0;
        createSubtask.mutate({ title: value, orderIndex });
        setTitle(""); // stay focused for rapid entry
    };

    const visible = (open && ordered.length > 0) || adding;
    return (
        <AnimatePresence initial={false}>
            {visible ? (
                <motion.div
                    id={id}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    // Rows pull left into the space under the task's checkbox so the grip costs no title width.
                    className="-ml-7 overflow-hidden"
                >
                    <div className="pt-0.5">
                        {ordered.length > 0 && (
                            <SortableSubtaskList
                                subtasks={ordered}
                                onReorder={(payload) => reorderSubtask.mutate(payload)}
                                renderItem={({ subtask, dragHandleProps, isDragging }) => (
                                    <InlineSubtaskItem
                                        subtask={subtask}
                                        onDelete={(subtaskId) => deleteSubtask.mutate(subtaskId)}
                                        dragHandleProps={dragHandleProps}
                                        isDragging={isDragging}
                                    />
                                )}
                            />
                        )}
                        {adding ? (
                            <div className="flex items-center gap-1.5 rounded-xl px-1 py-0.5">
                                <span className="w-[18px] shrink-0" aria-hidden="true" />
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
                                    <span className="h-6 w-6 rounded-full border-[1.5px] border-twilight-text-muted/70" />
                                </span>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    data-no-dnd="true"
                                    data-no-open="true"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") submit();
                                        if (e.key === "Escape") stopAdding();
                                    }}
                                    onBlur={() => (title.trim() ? submit() : stopAdding())}
                                    placeholder="Add subtask..."
                                    aria-label="New subtask"
                                    className="min-w-0 flex-1 bg-transparent text-[13px] leading-5 text-twilight-text-soft outline-none placeholder:text-twilight-text-muted"
                                />
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => onAddingChange(true)}
                                data-no-dnd="true"
                                data-no-open="true"
                                className="flex w-full cursor-pointer items-center gap-1.5 rounded-xl px-1 py-0.5 text-left text-[13px] leading-5 text-twilight-text-muted transition-colors hover:bg-white/[0.03] hover:text-twilight-text-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                            >
                                <span className="w-[18px] shrink-0" aria-hidden="true" />
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
                                    <Plus size={14} />
                                </span>
                                Add subtask
                            </button>
                        )}
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
