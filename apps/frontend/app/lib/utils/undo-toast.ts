import { toast } from "sonner";
import { CADENCE_UNDO_DURATION } from "./cadence-toast";

export class UndoneError extends Error {
    constructor() {
        super("undone");
        this.name = "UndoneError";
    }
}

export const isUndone = (error: unknown): error is UndoneError => error instanceof UndoneError;

export const toastName = (title: string, max = 60): string =>
    title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;

interface UndoToastOptions {
    description?: string;
    id?: string | number;
}

export function toastUndo(message: string, onUndo: () => void, { description, id }: UndoToastOptions = {}) {
    return toast.message(message, {
        id,
        description,
        duration: CADENCE_UNDO_DURATION,
        action: { label: "Undo", onClick: () => onUndo() },
    });
}

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
