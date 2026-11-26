import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Brain } from "lucide-react";
import { toastName } from "../../../lib/utils/undo-toast";
import { useForgetMemory, useMemoryPage, useRestoreMemory } from "../../../hooks/ai/use-memory";
import { queryKeys } from "../../../lib/api/query-keys";
import { outcomeOf, type ToolRenderContext } from "./ApprovalCard";

const VERBS: Record<string, string> = { forgot: "Forgot", updated: "Updated", kept: "Already remembered" };

function receiptState(
    action: string | undefined,
    known: boolean | undefined,
    undone: boolean,
    stale: boolean | undefined,
) {
    const forgot = action === "forgot";
    const gone = !undone && known === false && !forgot;
    const back = !undone && known === true && forgot;
    const canUndo = !stale && !undone && !gone && !back && known !== undefined && (action === "saved" || forgot);
    return { label: receiptLabel(action, { undone, gone, back }), canUndo };
}

function receiptLabel(
    action: string | undefined,
    { undone, gone, back }: { undone: boolean; gone: boolean; back: boolean },
) {
    if (undone) return action === "forgot" ? "Brought back" : "Not saved";
    if (gone) return "No longer remembered";
    if (back) return "Brought back";
    return VERBS[action ?? ""] ?? "Remembered";
}

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
    useEffect(() => {
        if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.ai.memory });
    }, [id, queryClient]);

    if (!output || output.ok !== true || !output.id || !output.text) return null;
    const known = page.data && !page.isFetching ? page.data.facts.some((f) => f.id === output.id) : undefined;
    const { label, canUndo } = receiptState(output.action, known, undone, stale);

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
                {label}: {toastName(output.text, 80)}
            </span>
            {canUndo ? (
                <button
                    type="button"
                    onClick={undo}
                    className="shrink-0 cursor-pointer font-medium text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    Undo
                </button>
            ) : null}
        </span>
    );
}
