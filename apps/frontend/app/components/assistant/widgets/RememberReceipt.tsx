import { useState } from "react";
import { Brain } from "lucide-react";
import { toastName } from "../../../lib/utils/undo-toast";
import { useForgetMemory, useRestoreMemory } from "../../../hooks/ai/use-memory";
import { outcomeOf, type ToolRenderContext } from "./ApprovalCard";

/**
 * `remember` already ran on the server: this is its one-line receipt, "Remembered: … · Undo".
 * No card and no approval: Undo is the safety. A save is taken back with no trace; a forget
 * is brought back inside its 10-minute window. A change to an existing fact says so, in words.
 */
export function RememberReceipt({ ctx }: { ctx: ToolRenderContext<"remember"> }) {
    const { part, stale } = ctx;
    const forget = useForgetMemory();
    const restore = useRestoreMemory();
    const [undone, setUndone] = useState(false);

    // Nothing to show while it runs, and a failure explains itself in the assistant's own words.
    if (outcomeOf(part, stale) !== "done") return null;
    const output = part.output;
    if (!output || output.ok !== true || !output.id || !output.text) return null;

    const verb = output.action === "forgot" ? "Forgot" : output.action === "updated" ? "Updated" : output.action === "kept" ? "Already remembered" : "Remembered";
    // An update can't be reverted from here (the old wording isn't kept), and a fact already known was not added: the person just asks.
    const canUndo = !stale && !undone && (output.action === "saved" || output.action === "forgot");

    const undo = () => {
        setUndone(true);
        if (output.action === "forgot") restore.mutate(output.id!);
        else forget.mutate({ id: output.id!, undo: true });
    };

    return (
        <span
            role="status"
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-1 text-[11px] text-twilight-text-soft"
        >
            <Brain size={11} aria-hidden className="shrink-0 text-accent-primary" />
            <span className="min-w-0 truncate">
                {undone ? (output.action === "forgot" ? "Brought back" : "Not saved") : verb}: {toastName(output.text, 80)}
            </span>
            {canUndo ? (
                <button type="button" onClick={undo} className="shrink-0 cursor-pointer font-medium text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                    Undo
                </button>
            ) : null}
        </span>
    );
}
