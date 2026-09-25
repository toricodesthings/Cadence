import { useState } from "react";
import type { Habit } from "@cadence/contracts/habit";
import * as AlertDialog from "../../components/primitives/AlertDialog";
import { Button } from "../../components/primitives/Button";
import { isRoutinePaused } from "../../lib/utils/habits";
import { useDeleteHabit } from "./use-delete-habit";
import { useUpdateHabit } from "./use-update-habit";
import { usePauseHabit, useResumeHabit } from "./use-pause-habit";

/**
 * Everything a routine's menus and editor can do to it. Render `deleteDialog`
 * once next to the trigger; `requestDelete` opens it. `onGone` runs after an
 * archive, a restore or a confirmed delete (an open editor closes).
 */
export function useRoutineActions(habit: Habit, { onGone }: { onGone?: () => void } = {}) {
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { mutate: updateHabit } = useUpdateHabit();
    const { mutate: deleteHabit } = useDeleteHabit();
    const { pause } = usePauseHabit();
    const { resume } = useResumeHabit();

    const deleteDialog = (
        <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>Delete "{habit.title}"?</AlertDialog.Title>
                    <AlertDialog.Description>This permanently removes the routine and all its history. It can't be undone.</AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild><Button variant="ghost" size="md">Cancel</Button></AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button variant="danger" size="md" onClick={() => { deleteHabit(habit.id); onGone?.(); }}>Delete routine</Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );

    return {
        isPaused: isRoutinePaused(habit),
        /** Pause from today until `until` (a Date), a week by default. */
        pause: (until?: Date) => pause(habit.id, until),
        resume: () => resume(habit.id),
        toggleArchive: () => {
            updateHabit({ id: habit.id, archived: !habit.archived });
            onGone?.(); // it leaves the list being shown
        },
        requestDelete: () => setDeleteOpen(true),
        deleteDialog,
    };
}
