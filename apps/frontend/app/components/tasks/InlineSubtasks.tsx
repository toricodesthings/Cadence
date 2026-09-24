import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import type { Subtask } from "@cadence/contracts/subtask";
import { useCreateSubtask, useDeleteSubtask, useReorderSubtasks } from "../../hooks/tasks/use-subtasks";
import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";
import { SortableSubtaskList, type SortableSubtaskRenderProps } from "./SortableSubtaskList";
import { TaskCheckbox } from "./TaskCheckbox";
import { Tip } from "../primitives/Tooltip";

/**
 * A row's subtasks, as on task cards: a progress chip that opens an inline panel under the title.
 * Rows own the open/adding state so a menu's "Add subtask" can open the panel straight into the input.
 */

export function useInlineSubtasks() {
    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState(false);
    return {
        open,
        adding,
        toggle: () => setOpen((o) => !o),
        startAdding: () => {
            setOpen(true);
            setAdding(true);
        },
        setAdding,
    };
}

const byOrder = (subtasks: Subtask[]) => [...subtasks].sort((a, b) => a.orderIndex - b.orderIndex);

/** Chevron, progress bar and "done/total". Turns green with a tick once every subtask is done. */
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
    return (
        <Tip label={open ? "Hide subtasks" : "Show subtasks"}>
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
                aria-label={`Subtasks, ${done} of ${subtasks.length} done`}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary pointer-coarse:min-h-9 pointer-coarse:px-3.5 ${
                    allDone
                        ? "border-feedback-success/25 bg-feedback-success/10 text-feedback-success"
                        : "border-white/[0.07] bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text"
                } ${open ? "bg-white/[0.06]" : ""}`}
            >
                <ChevronRight
                    size={12}
                    aria-hidden="true"
                    className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                />
                {allDone ? (
                    <Check size={12} aria-hidden="true" />
                ) : (
                    <span className="flex h-1.5 w-5 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden="true">
                        <span
                            className="h-full bg-feedback-success/60 transition-all duration-300"
                            style={{ width: `${(done / subtasks.length) * 100}%` }}
                        />
                    </span>
                )}
                <span aria-hidden="true">
                    {done}/{subtasks.length}
                </span>
            </button>
        </Tip>
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
            className={`group/sub flex items-center gap-1.5 rounded-xl px-1 py-1.5 transition-colors hover:bg-white/[0.03] ${
                isDragging ? "opacity-50" : "opacity-100"
            }`}
        >
            <div
                ref={dragHandleProps.ref}
                {...dragHandleProps.attributes}
                {...dragHandleProps.listeners}
                className={`shrink-0 cursor-grab rounded-lg p-0.5 text-twilight-text-soft transition-opacity ${reveal}`}
                data-no-dnd="true"
                data-no-open="true"
                aria-label="Drag to reorder subtask"
            >
                <GripVertical size={14} aria-hidden="true" />
            </div>
            <TaskCheckbox subtask={subtask} compact />
            <span
                className={`min-w-0 flex-1 text-[14px] leading-6 transition-colors ${
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

/** The panel the chip opens: header with count and Add, the sortable list, and the add input. */
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
    const done = ordered.filter((s) => s.isComplete).length;

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
                    className="overflow-hidden"
                >
                    <div className="mt-3 border-t border-white/[0.06] pt-3">
                        {ordered.length > 0 && (
                            <>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-muted">
                                            Subtasks
                                        </p>
                                        <p className="mt-1 text-[12px] font-semibold tabular-nums text-twilight-text">
                                            {done}/{ordered.length}
                                        </p>
                                    </div>
                                    {!adding && (
                                        <button
                                            type="button"
                                            onClick={() => onAddingChange(true)}
                                            data-no-dnd="true"
                                            data-no-open="true"
                                            className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-twilight-text"
                                        >
                                            <Plus size={12} aria-hidden="true" />
                                            Add
                                        </button>
                                    )}
                                </div>
                                <div className="mt-3 space-y-1">
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
                                </div>
                            </>
                        )}
                        {adding && (
                            <div className={`${ordered.length ? "mt-3" : ""} flex items-center gap-1.5 rounded-xl px-1 py-1.5`}>
                                <div className="h-6 w-6 shrink-0 rounded-full border-[1.5px] border-twilight-text-muted/70" />
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
                                    className="min-w-0 flex-1 bg-transparent text-[14px] leading-6 text-twilight-text-soft outline-none placeholder:text-twilight-text-muted"
                                />
                            </div>
                        )}
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
