/**
 * Cards for Capture writes: `update_captures` (keep, discard, tick off, back to
 * New, new words) and `delete_captures`.
 */
import { Archive, Check, CheckCircle2, Inbox, RotateCcw, Pencil, StickyNote } from "lucide-react";
import { ApprovalCard, DeleteApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { useCaptureLookup } from "./card-lookups";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";

type CaptureAction = "note" | "discard" | "done" | "new";
const ACTION_COPY: Record<CaptureAction, string> = { note: "Keep as a note", discard: "Discard", done: "Tick off", new: "Back to New" };
const ACTION_GLYPH = { note: StickyNote, discard: Archive, done: CheckCircle2, new: RotateCcw, edit: Pencil };

/** Card for `update_captures`: each capture with what happens to it. */
export function UpdateCapturesCard({ ctx }: { ctx: ToolRenderContext<"update_captures"> }) {
    const lookup = useCaptureLookup();
    const { off, onToggle, removed } = useUnticked(ctx);
    const items: { inboxItemId: string; text?: string; action?: CaptureAction }[] = ctx.part?.input?.items ?? [];
    const rows = items.map((item) => {
        const current = lookup(item.inboxItemId)?.rawText ?? "a capture";
        const what = [item.action ? ACTION_COPY[item.action] : null, item.text !== undefined ? `reword to “${item.text}”` : null].filter(Boolean).join(", ");
        return `${current}: ${what}`;
    });
    const actions = new Set(items.map((item) => item.action ?? "edit"));
    const only = actions.size === 1 ? [...actions][0] : undefined;
    const kept = rows.length - off.size;
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow={rows.length > 1 ? `CAPTURE · ${rows.length}` : "CAPTURE"}
            eyebrowGlyph={only ? ACTION_GLYPH[only] : Inbox}
            ariaLabel={`Capture changes: ${rows.join("; ")}`}
            primaryLabel={only && only !== "edit" ? `${ACTION_COPY[only]}${rows.length > 1 ? ` ${kept}` : ""}` : "Apply"}
            primaryGlyph={Check}
            removed={removed(rows)}
            doneText={rows.length > 1 ? `Updated ${rows.length} captures.` : "Updated the capture."}
            declinedText="Left Capture as it was."
        >
            <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                {rows.map((row, i) => (
                    <TickRow key={i} on={!off.has(i)} onToggle={onToggle(i)} label={row}>
                        <span className="text-truncate-safe">{row}</span>
                    </TickRow>
                ))}
            </div>
        </ApprovalCard>
    );
}

/** Danger card for `delete_captures`: permanent, so the exact words are echoed. Auto still waits for this tap. */
export function DeleteCapturesCard({ ctx }: { ctx: ToolRenderContext<"delete_captures"> }) {
    const persona = useAssistantPersona();
    const { off, onToggle, removed } = useUnticked(ctx);
    const texts = (ctx.part?.input?.items ?? []).map((item) => item.text);
    const kept = texts.length - off.size;
    return (
        <DeleteApprovalCard
            ctx={ctx}
            eyebrow={texts.length > 1 ? `DELETE ${texts.length} CAPTURES` : "DELETE CAPTURE"}
            ariaLabel={`Delete captures: ${texts.join(", ")}`}
            primaryLabel={texts.length > 1 ? `Delete ${kept}` : "Delete it"}
            removed={removed(texts)}
            doneText={`Deleted ${ctx.part?.output?.deleted ?? texts.length} for good.`}
        >
            <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                {texts.map((text, i) => (
                    <TickRow key={i} on={!off.has(i)} onToggle={onToggle(i)} label={text}>
                        <span className="line-clamp-2">{text}</span>
                    </TickRow>
                ))}
            </div>
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">These won’t come back. Discard is the one you can undo.</p>}
        </DeleteApprovalCard>
    );
}

