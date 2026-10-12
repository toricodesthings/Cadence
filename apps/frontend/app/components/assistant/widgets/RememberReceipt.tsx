import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Brain } from "lucide-react";
import { toastName } from "../../../lib/utils/undo-toast";
import { useForgetMemory, useMemoryPage, useRestoreMemory } from "../../../hooks/ai/use-memory";
import { queryKeys } from "../../../lib/api/query-keys";
import { outcomeOf, type ToolRenderContext } from "./ApprovalCard";

/**
 * `remember` already ran on the server: this is its one-line receipt, "Remembered: … · Undo".
 * No card and no approval: Undo is the safety. A save is taken back with no trace; a forget
 * is brought back inside its 10-minute window. A change to an existing fact says so, in words.
 * What it says comes from the memory page, not from this click: after a reload, or an Undo in another
 * tab, a fact that is gone reads "No longer remembered" and offers no Undo.
 */
export function RememberReceipt({ ctx }: { ctx: ToolRenderContext<"remember"> }) {
    const { part, stale } = ctx;
    const forget = useForgetMemory();
    const restore = useRestoreMemory();
    const [undone, setUndone] = useState(false);
    const queryClient = useQueryClient();
    const page = useMemoryPage();
    const done = outcomeOf(part, stale) === "done";
    const output = done ? part.output : undefined;
    const id = output?.ok === true ? output.id : undefined;
    // The page was read before this save landed: read it again before judging what still exists.
    useEffect(() => {
        if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.ai.memory });
    }, [id, queryClient]);

    // Nothing to show while it runs, and a failure explains itself in the assistant's own words.
    if (!output || output.ok !== true || !output.id || !output.text) return null;
    const known = page.data && !page.isFetching ? page.data.facts.some((f) => f.id === output.id) : undefined;
    const gone = !undone && known === false && output.action !== "forgot";
    const back = !undone && known === true && output.action === "forgot";

    const verb = output.action === "forgot" ? "Forgot" : output.action === "updated" ? "Updated" : output.action === "kept" ? "Already remembered" : "Remembered";
    // An update can't be reverted from here (the old wording isn't kept), and a fact already known was not added: the person just asks.
    const canUndo = !stale && !undone && !gone && !back && known !== undefined && (output.action === "saved" || output.action === "forgot");

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
                {undone ? (output.action === "forgot" ? "Brought back" : "Not saved") : gone ? "No longer remembered" : back ? "Brought back" : verb}: {toastName(output.text, 80)}
            </span>
            {canUndo ? (
                <button type="button" onClick={undo} className="shrink-0 cursor-pointer font-medium text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                    Undo
                </button>
            ) : null}
        </span>
    );
}
