/**
 * Cards for Capture writes: `update_captures` (keep, discard, tick off, back to
 * New, new words) and `delete_captures`. `StructureCapturesCard` and
 * `InboxStructureCard` render the retired `structure_captures` and
 * `structure_inbox_item` in older threads (captures now become tasks via `create_tasks`).
 */
import { AlertCircle, Archive, Check, CheckCircle2, Inbox, NotebookPen, RotateCcw, Trash2, Pencil } from "lucide-react";
import { IdentityBlock } from "./ProposalCard";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { DraftDetails, DraftNote, DraftQuotes, DraftSteps, type TaskDraft } from "./TaskBatchCard";
import { useCaptureLookup } from "./card-lookups";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";

type CaptureDraft = TaskDraft & { inboxItemId?: string };

/** Retired `structure_captures` (still in older threads): one capture whole, or several as rows the user can untick. */
export function StructureCapturesCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const { off, onToggle, removed } = useUnticked(ctx);
    const drafts = ((ctx.part?.input?.items ?? []) as CaptureDraft[]).map((d) => normalizeTaskWriteTemporalInput(d));
    const count = drafts.length;
    const kept = count - off.size;
    const first = drafts[0] ?? {};
    const labels = drafts.map((d, i) => d.title ?? `capture ${i + 1}`);
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow={count > 1 ? `SORT ${count} CAPTURES` : "STRUCTURE THIS CAPTURE"}
            eyebrowGlyph={Inbox}
            ariaLabel={`Make tasks: ${labels.join(", ")}`}
            primaryLabel={count > 1 ? `Make ${kept} tasks` : "Make it a task"}
            primaryGlyph={Check}
            removed={removed(labels)}
            doneText={count > 1 ? `Turned ${ctx.part?.output?.created?.length ?? count} captures into tasks.` : "Turned it into a task."}
            declinedText="Left them in Capture."
        >
            {count === 1 ? (
                <>
                    <IdentityBlock title={labels[0]} subtitle={!persona.terse && first.note ? <DraftNote note={first.note} /> : undefined} />
                    <DraftDetails draft={first} />
                    <DraftSteps draft={first} />
                    <DraftQuotes draft={first} />
                </>
            ) : (
                <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                    {drafts.map((draft, i) => (
                        <TickRow key={i} on={!off.has(i)} onToggle={onToggle(i)} label={`Make ${labels[i]}`}>
                            <p className="text-twilight-text">{labels[i]}</p>
                            {draft.subtasks?.length ? (
                                <p className="text-[10px] text-twilight-text-muted">{draft.subtasks.length} {draft.subtasks.length === 1 ? "step" : "steps"}</p>
                            ) : null}
                            <div className="mt-0.5"><DraftDetails draft={draft} /></div>
                        </TickRow>
                    ))}
                </div>
            )}
        </ApprovalCard>
    );
}

type CaptureAction = "note" | "discard" | "done" | "new";
const ACTION_COPY: Record<CaptureAction, string> = { note: "Keep as a note", discard: "Discard", done: "Tick off", new: "Back to New" };
const ACTION_GLYPH = { note: NotebookPen, discard: Archive, done: CheckCircle2, new: RotateCcw, edit: Pencil };

/** Card for `update_captures`: each capture with what happens to it. */
export function UpdateCapturesCard({ ctx }: { ctx: ToolRenderContext }) {
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
export function DeleteCapturesCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const { off, onToggle, removed } = useUnticked(ctx);
    const texts = ((ctx.part?.input?.items ?? []) as { text: string }[]).map((item) => item.text);
    const kept = texts.length - off.size;
    return (
        <ApprovalCard
            ctx={ctx}
            tone="danger"
            eyebrow={texts.length > 1 ? `DELETE ${texts.length} CAPTURES` : "DELETE CAPTURE"}
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete captures: ${texts.join(", ")}`}
            primaryLabel={texts.length > 1 ? `Delete ${kept}` : "Delete it"}
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            removed={removed(texts)}
            doneText={`Deleted ${ctx.part?.output?.deleted ?? texts.length} for good.`}
            declinedText="Kept it."
        >
            <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                {texts.map((text, i) => (
                    <TickRow key={i} on={!off.has(i)} onToggle={onToggle(i)} label={text}>
                        <span className="line-clamp-2">{text}</span>
                    </TickRow>
                ))}
            </div>
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">These won’t come back. Discard is the one you can undo.</p>}
        </ApprovalCard>
    );
}

/** Retired `structure_inbox_item` (one capture per call), still in older threads. */
export function InboxStructureCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const draft = normalizeTaskWriteTemporalInput((ctx.part?.input ?? {}) as TaskDraft);
    const title = draft.title ?? "this capture";
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="STRUCTURE THIS CAPTURE"
            eyebrowGlyph={Inbox}
            ariaLabel={`Structure capture: ${title}`}
            primaryLabel="Make it a task"
            primaryGlyph={Check}
            doneText="Turned it into a task."
            declinedText="Left it in Capture."
        >
            <IdentityBlock title={title} subtitle={!persona.terse && draft.note ? <DraftNote note={draft.note} /> : undefined} />
            <DraftDetails draft={draft} />
            <DraftSteps draft={draft} />
            <DraftQuotes draft={draft} />
        </ApprovalCard>
    );
}
