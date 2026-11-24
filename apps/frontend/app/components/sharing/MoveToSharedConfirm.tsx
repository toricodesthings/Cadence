import { useState } from "react";
import { create } from "zustand";
import type { Project } from "@cadence/contracts/project";
import { isSharedList } from "../../hooks/sharing/use-list-access";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";

interface PendingMove {
    listName: string;
    itemLabel: string;
    run: () => void;
}

const usePendingSharedMove = create<{ pending: PendingMove | null; setPending: (next: PendingMove | null) => void }>(
    (set) => ({
        pending: null,
        setPending: (pending) => set({ pending }),
    }),
);

/** Imperative confirm for menus that unmount on item select (e.g. context menus). */
export function guardMoveToShared(
    destProject: Project | undefined,
    alreadyShared: boolean,
    run: () => void,
    itemLabel = "task",
) {
    if (destProject && isSharedList(destProject) && !alreadyShared) {
        usePendingSharedMove.getState().setPending({ listName: destProject.name, itemLabel, run });
        return;
    }
    run();
}

function renderPending(pending: PendingMove | null, clear: () => void) {
    if (!pending) return null;
    return (
        <MoveToSharedConfirm
            open
            onOpenChange={(open) => !open && clear()}
            listName={pending.listName}
            itemLabel={pending.itemLabel}
            onConfirm={() => {
                const fn = pending.run;
                clear();
                fn();
            }}
        />
    );
}

/** Mounted once in `providers.tsx` to host confirms triggered from unmounting menus. */
export function SharedMoveConfirmHost() {
    const pending = usePendingSharedMove((s) => s.pending);
    const setPending = usePendingSharedMove((s) => s.setPending);
    return renderPending(pending, () => setPending(null));
}

/**
 * Confirmation before moving a personal task or capture into a shared list.
 * Explains plainly that everyone in the list will see it while personal reminders and tags stay private.
 */
export function MoveToSharedConfirm({
    open,
    onOpenChange,
    listName,
    itemLabel = "task",
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    listName: string;
    itemLabel?: string;
    onConfirm: () => void;
}) {
    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>{`Move to "${listName}"?`}</AlertDialog.Title>
                    <AlertDialog.Description>
                        {`Everyone in ${listName} will see this ${itemLabel}, including its subtasks and note. Your reminder and tags stay private to you.`}
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="sm">
                            Cancel
                        </Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button variant="primary" size="sm" onClick={onConfirm}>
                            Move to shared list
                        </Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}

/** Wraps a move/place action so moving an unshared item into a shared list confirms first. */
export function useMoveToSharedGuard(itemLabel = "task") {
    const [pending, setPending] = useState<PendingMove | null>(null);
    const guard = (destProject: Project | undefined, alreadyShared: boolean, run: () => void) => {
        if (destProject && isSharedList(destProject) && !alreadyShared) {
            setPending({ listName: destProject.name, itemLabel, run });
            return;
        }
        run();
    };
    return { guard, dialog: renderPending(pending, () => setPending(null)) };
}
