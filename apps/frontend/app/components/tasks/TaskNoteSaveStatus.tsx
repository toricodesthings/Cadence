import { Check, Loader2, AlertCircle } from "lucide-react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface TaskNoteSaveStatusProps {
    status: SaveStatus;
}

/** Tiny status pill shown beside the character counter. */
export function TaskNoteSaveStatus({ status }: TaskNoteSaveStatusProps) {
    if (status === "idle") return null;

    return (
        <span
            className={`inline-flex items-center gap-1 text-[10px] tabular-nums transition-opacity ${
                status === "saving"
                    ? "text-twilight-text-muted/90"
                    : status === "saved"
                      ? "text-feedback-success/80"
                      : "text-red-400"
            }`}
            aria-live="polite"
        >
            {status === "saving" && (
                <>
                    <Loader2 size={10} className="animate-spin" aria-hidden="true" />
                    Saving
                </>
            )}
            {status === "saved" && (
                <>
                    <Check size={10} aria-hidden="true" />
                    Saved
                </>
            )}
            {status === "error" && (
                <>
                    <AlertCircle size={10} aria-hidden="true" />
                    Save failed
                </>
            )}
        </span>
    );
}
