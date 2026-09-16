import React, { useState } from "react";
import * as ContextMenu from "../primitives/ContextMenu";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { HabitMenuItems } from "./HabitMenu";
import { useDeleteHabit } from "../../hooks/habits/use-delete-habit";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { usePauseHabit, useResumeHabit } from "../../hooks/habits/use-pause-habit";
import { trackUsageEvent } from "../../lib/api/track-event";
import type { Habit } from "@cadence/contracts/habit";

interface HabitContextMenuWrapperProps {
    habit: Habit;
    onEdit: () => void;
    children: React.ReactNode;
}

/** Right-click context menu for habit cards — uses the same HabitMenuItems
 *  as the three-dot dropdown, so both menus expose identical actions. */
export function HabitContextMenuWrapper({ habit, children, onEdit }: HabitContextMenuWrapperProps) {
    const [deleteOpen, setDeleteOpen] = useState(false);

    const { mutate: deleteHabit } = useDeleteHabit();
    const { mutate: updateHabit } = useUpdateHabit();
    const { pause: pauseHabit } = usePauseHabit();
    const { resume: resumeHabit } = useResumeHabit();

    const isPaused = !!(habit.pausedUntil && new Date(habit.pausedUntil) > new Date());

    const handleArchiveToggle = () => {
        updateHabit({ id: habit.id, archived: !habit.archived });
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
                        onEdit={onEdit}
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
