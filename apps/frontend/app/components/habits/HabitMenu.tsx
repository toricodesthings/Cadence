import { useState } from "react";
import * as AlertDialog from "../primitives/AlertDialog";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as ContextMenu from "../primitives/ContextMenu";
import { Button } from "../primitives/Button";
import { MoreHorizontal, Pencil, Trash2, Archive, ArchiveRestore, Pause, Play } from "lucide-react";
import { useDeleteHabit } from "../../hooks/habits/use-delete-habit";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { usePauseHabit, useResumeHabit } from "../../hooks/habits/use-pause-habit";
import type { Habit } from "@cadence/contracts/habit";

interface HabitMenuProps {
    habit: Habit;
    onEdit: () => void;
}

export function HabitMenu({ habit, onEdit }: HabitMenuProps) {
    const [deleteOpen, setDeleteOpen] = useState(false);

    const { mutate: deleteHabit } = useDeleteHabit();
    const { mutate: updateHabit } = useUpdateHabit();
    const { pause: pauseHabit } = usePauseHabit();
    const { resume: resumeHabit } = useResumeHabit();

    const isPaused = habit.pausedUntil && new Date(habit.pausedUntil) > new Date();

    const handleArchiveToggle = () => {
        updateHabit({
            id: habit.id,
            archived: !habit.archived,
        });
    };

    const handleDelete = () => {
        deleteHabit(habit.id);
        setDeleteOpen(false);
    };

    return (
        <>
            {/* Delete confirmation */}
            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete "{habit.title}"?</AlertDialog.Title>
                        <AlertDialog.Description>
                            This will permanently remove the routine and all its history. This action cannot be undone.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={handleDelete}
                            >
                                Delete routine
                            </Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>

            {/* Trigger button */}
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        className="btn-icon -my-2 -mr-2 shrink-0 text-twilight-text-muted opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 touch-reveal hover:bg-white/[0.06] hover:text-twilight-text focus-visible:opacity-100"
                        aria-label={`Open actions for habit ${habit.title}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <MoreHorizontal size={13} aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Content align="end" side="right">
                    <HabitMenuItems
                        habit={habit}
                        isPaused={!!isPaused}
                        MenuComponents={DropdownMenu}
                        onEdit={onEdit}
                        onArchiveToggle={handleArchiveToggle}
                        onDelete={() => setDeleteOpen(true)}
                        onPause={() => pauseHabit(habit.id)}
                        onResume={() => resumeHabit(habit.id)}
                    />
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </>
    );
}

type GenericMenu = typeof DropdownMenu | typeof ContextMenu;

interface HabitMenuItemsProps {
    habit: Habit;
    isPaused: boolean;
    MenuComponents: GenericMenu;
    onEdit: () => void;
    onArchiveToggle: () => void;
    onDelete: () => void;
    onPause: () => void;
    onResume: () => void;
}

/** Reusable inner items for either DropdownMenu or ContextMenu */
export function HabitMenuItems({ habit, isPaused, MenuComponents: Menu, onEdit, onArchiveToggle, onDelete, onPause, onResume }: HabitMenuItemsProps) {
    return (
        <>
            {/* Recovery actions first per §9.7 */}
            {isPaused ? (
                <Menu.Item
                    className="flex items-center gap-2 text-[13px]"
                    onSelect={onResume}
                >
                    <Play size={12} aria-hidden="true" />
                    Resume today
                </Menu.Item>
            ) : (
                <Menu.Item
                    className="flex items-center gap-2 text-[13px]"
                    onSelect={onPause}
                >
                    <Pause size={12} aria-hidden="true" />
                    Pause for now
                </Menu.Item>
            )}
            <Menu.Item
                className="flex items-center gap-2 text-[13px]"
                onSelect={onEdit}
            >
                <Pencil size={12} aria-hidden="true" />
                Edit routine
                <kbd className="ml-auto text-[10px] opacity-40 font-mono">e</kbd>
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
                className="flex items-center gap-2 text-[13px]"
                onSelect={onArchiveToggle}
            >
                {habit.archived ? (
                    <ArchiveRestore size={12} aria-hidden="true" />
                ) : (
                    <Archive size={12} aria-hidden="true" />
                )}
                {habit.archived ? "Restore routine" : "Archive routine"}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
                className="flex items-center gap-2 text-[13px] text-red-400 focus:text-red-400 focus:bg-red-500/10"
                onSelect={onDelete}
            >
                <Trash2 size={12} aria-hidden="true" />
                Delete routine
            </Menu.Item>
        </>
    );
}
