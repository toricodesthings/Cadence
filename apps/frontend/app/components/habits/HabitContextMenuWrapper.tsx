import React, { useState } from "react";
import * as ContextMenu from "../primitives/ContextMenu";
import * as Dialog from "../primitives/Dialog";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { HabitMenuItems } from "./HabitMenu";
import { useDeleteHabit } from "../../hooks/habits/use-delete-habit";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { usePauseHabit, useResumeHabit } from "../../hooks/habits/use-pause-habit";
import { CadencePicker } from "./CadencePicker";
import { trackUsageEvent } from "../../lib/api/track-event";
import type { Habit } from "../../types/habit";

interface HabitContextMenuWrapperProps {
    habit: Habit;
    children: React.ReactNode;
}

/** Right-click context menu for habit cards — uses the same HabitMenuItems
 *  as the three-dot dropdown, so both menus expose identical actions. */
export function HabitContextMenuWrapper({ habit, children }: HabitContextMenuWrapperProps) {
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [title, setTitle] = useState(habit.title);
    const [description, setDescription] = useState(habit.description ?? "");
    const [rrule, setRrule] = useState(habit.recurrenceRule);

    const { mutate: deleteHabit } = useDeleteHabit();
    const { mutate: updateHabit } = useUpdateHabit();
    const { pause: pauseHabit } = usePauseHabit();
    const { resume: resumeHabit } = useResumeHabit();

    const isPaused = !!(habit.pausedUntil && new Date(habit.pausedUntil) > new Date());

    const handleEditOpen = () => {
        setTitle(habit.title);
        setDescription(habit.description ?? "");
        setRrule(habit.recurrenceRule);
        setEditOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        updateHabit({
            id: habit.id,
            title: title.trim(),
            description: description.trim() || null,
            recurrenceRule: rrule,
        });
        setEditOpen(false);
    };

    const handleArchiveToggle = () => {
        updateHabit({ id: habit.id, archived: !habit.archived });
    };

    const handleDelete = () => {
        deleteHabit(habit.id);
        setDeleteOpen(false);
    };

    return (
        <>
            {/* Edit dialog */}
            <Dialog.Dialog open={editOpen} onOpenChange={setEditOpen}>
                <Dialog.DialogContent className="max-w-md">
                    <Dialog.DialogHeader>
                        <Dialog.DialogTitle>Edit habit</Dialog.DialogTitle>
                        <Dialog.DialogDescription>
                            Update the details for{" "}
                            <span className="text-twilight-text">{habit.title}</span>.
                        </Dialog.DialogDescription>
                    </Dialog.DialogHeader>
                    <form onSubmit={handleSave} className="flex flex-col gap-5 mt-2">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="habit-ctx-title" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">Name</label>
                            <input
                                id="habit-ctx-title"
                                autoFocus
                                required
                                placeholder="Habit name"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none transition-[border-color,box-shadow] duration-200 focus:border-accent-primary/30 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)]"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="habit-ctx-desc" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                Purpose <span className="normal-case tracking-normal font-normal text-twilight-text-muted/40">— optional</span>
                            </label>
                            <textarea
                                id="habit-ctx-desc"
                                placeholder="Why are you building this habit?"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                                className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none transition-[border-color,box-shadow] duration-200 focus:border-accent-primary/30 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)] resize-none"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">Cadence</label>
                            <CadencePicker value={rrule} onChange={setRrule} />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-xl text-[13px] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors duration-200 cursor-pointer">Cancel</button>
                            <button type="submit" disabled={!title.trim()} className="px-4 py-2 rounded-xl text-[13px] bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors duration-200 disabled:opacity-40 disabled:pointer-events-none cursor-pointer">Save changes</button>
                        </div>
                    </form>
                </Dialog.DialogContent>
            </Dialog.Dialog>

            {/* Delete confirmation */}
            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete "{habit.title}"?</AlertDialog.Title>
                        <AlertDialog.Description>
                            This will permanently remove the habit and all its history. This action cannot be undone.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">Cancel</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button variant="danger" size="md" onClick={handleDelete}>Delete habit</Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>

            <ContextMenu.Root onOpenChange={(isOpen) => {
                if (isOpen) trackUsageEvent("habit.context_menu_opened", { object_type: "habit", input_method: "context_menu" });
            }}>
                <ContextMenu.Trigger asChild>
                    {children}
                </ContextMenu.Trigger>
                <ContextMenu.Content>
                    <HabitMenuItems
                        habit={habit}
                        isPaused={isPaused}
                        MenuComponents={ContextMenu}
                        onEdit={handleEditOpen}
                        onArchiveToggle={handleArchiveToggle}
                        onDelete={() => setDeleteOpen(true)}
                        onPause={() => pauseHabit(habit.id)}
                        onResume={() => resumeHabit(habit.id)}
                    />
                </ContextMenu.Content>
            </ContextMenu.Root>
        </>
    );
}
