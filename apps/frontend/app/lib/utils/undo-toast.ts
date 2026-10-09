import { toast } from "sonner";
import { CADENCE_UNDO_DURATION } from "./cadence-toast";

/** Thrown into a deferred mutation when the person pressed Undo; mutations roll back without an error toast. */
export class UndoneError extends Error {
    constructor() {
        super("undone");
        this.name = "UndoneError";
    }
}

export const isUndone = (error: unknown): error is UndoneError => error instanceof UndoneError;

interface UndoToastOptions {
    description?: string;
    /** Same id replaces the toast instead of stacking one per repeat. */
    id?: string | number;
}

/**
 * Toast for a change that has already happened and can be reversed (a task sent to Trash):
 * the message plus a working Undo. `onUndo` does the reversal.
 */
export function toastUndo(message: string, onUndo: () => void, { description, id }: UndoToastOptions = {}) {
    return toast.message(message, {
        id,
        description,
        duration: CADENCE_UNDO_DURATION,
        action: { label: "Undo", onClick: () => onUndo() },
    });
}

/**
 * Toast for a destructive change the server can't reverse (deleting a list, tag, routine or
 * conversation). The screen updates at once, but nothing is sent until the window closes:
 * resolves when it runs out (or the toast is swiped away), rejects with `UndoneError` on Undo.
 * Await it first thing in a mutation's `mutationFn`, after `onMutate` has hidden the item.
 *
 * Closing the tab inside the window leaves the item where it was, which is the safe way to fail.
 */
export function undoWindow(message: string, { description, id }: UndoToastOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (undone: boolean) => {
            if (settled) return;
            settled = true;
            if (undone) reject(new UndoneError());
            else resolve();
        };
        toast.message(message, {
            id,
            description,
            duration: CADENCE_UNDO_DURATION,
            action: { label: "Undo", onClick: () => finish(true) },
            onAutoClose: () => finish(false),
            onDismiss: () => finish(false),
        });
    });
}
