import { Sparkles, Calendar, Clock, Check, ListChecks, Image as ImageIcon, Lock, Repeat } from "lucide-react";
import { IdentityBlock, MetaPill } from "./ProposalCard";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { formatWhen } from "./card-lookups";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "../../tasks/task-choice-options";
import { PRIORITY_CONFIG } from "../../../lib/constants/priority";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";
import type { CreateTaskInput } from "@cadence/contracts/task";

type Quoted = "title" | "dueDate" | "scheduledStart" | "priority" | "subtasks";

/** A task as the assistant drafts it (`create_tasks`, `structure_inbox_item`). */
export type TaskDraft = Partial<Pick<CreateTaskInput, "title" | "dueDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "priority" | "effort" | "recurrenceRule">> & {
    subtasks?: string[];
    fixed?: boolean;
    note?: string;
    /** Field → the exact words the image shows for it. */
    fromImage?: Partial<Record<Quoted, string>>;
};

/** "from your image: '…'" under a field the assistant copied from a photo. */
export function ImageQuote({ quote }: { quote?: string }) {
    if (!quote) return null;
    return (
        <p className="flex items-center gap-1 text-[10px] text-twilight-text-muted">
            <ImageIcon size={10} className="shrink-0" aria-hidden="true" />
            <span>from your image: “{quote}”</span>
        </p>
    );
}

/** A draft's when / length / effort / priority pills, with the image's words under what came from it. */
export function DraftDetails({ draft }: { draft: TaskDraft }) {
    const when = formatWhen(draft.scheduledStart ?? draft.dueDate);
    const effort = draft.effort != null ? EFFORT_OPTIONS.find((o) => o.value === draft.effort) : undefined;
    // A priority read off an image shows as its word with the quote, never as a bare badge.
    const imagePriority = draft.fromImage?.priority && draft.priority != null ? PRIORITY_OPTIONS.find((o) => o.value === draft.priority) : undefined;
    return (
        <>
            <div className="flex flex-wrap gap-1.5">
                {when ? <MetaPill icon={Calendar}>{when}</MetaPill> : null}
                {draft.durationEstimate ? <MetaPill icon={Clock}>{draft.durationEstimate}m block</MetaPill> : null}
                {effort ? <MetaPill icon={effort.icon}>{effort.label} effort</MetaPill> : null}
                {imagePriority ? <MetaPill icon={imagePriority.icon}>{imagePriority.label}</MetaPill> : null}
                {draft.recurrenceRule ? <MetaPill icon={Repeat}>Repeats</MetaPill> : null}
                {draft.fixed ? <MetaPill icon={Lock}>Fixed</MetaPill> : null}
            </div>
            <ImageQuote quote={draft.fromImage?.dueDate ?? draft.fromImage?.scheduledStart} />
            <ImageQuote quote={draft.fromImage?.priority} />
        </>
    );
}

/** The checklist steps a draft brings with it. */
export function DraftSteps({ draft }: { draft: TaskDraft }) {
    if (!draft.subtasks?.length) return null;
    return (
        <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
            {draft.subtasks.map((step, i) => (
                <p key={i} className="flex items-center gap-1.5 py-0.5 text-[11px] text-twilight-text-soft">
                    <ListChecks size={11} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
                    <span className="min-w-0">{step}</span>
                </p>
            ))}
            <ImageQuote quote={draft.fromImage?.subtasks} />
        </div>
    );
}

/**
 * Card for `create_tasks` (design §4.1): one task shows whole, with its checklist;
 * several show as rows the user can untick. One tap adds them all.
 */
export function TaskBatchCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const { off, toggle } = useUnticked();
    const drafts: TaskDraft[] = ((ctx.part?.input?.tasks ?? []) as TaskDraft[]).map((d) => normalizeTaskWriteTemporalInput(d));
    const count = drafts.length;
    const kept = count - off.size;
    const first = drafts[0] ?? {};
    const title = first.title ?? "this task";
    const when = formatWhen(first.scheduledStart ?? first.dueDate);
    const created: unknown[] = ctx.part?.output?.created ?? [];
    const eyebrow = count > 1 ? `${count} NEW TASKS` : "NEW TASK";

    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow={eyebrow}
            eyebrowGlyph={Sparkles}
            ariaLabel={count > 1 ? eyebrow : `${eyebrow}: ${title}`}
            primaryLabel={count > 1 ? (kept === count ? `Add all ${count}` : `Add ${kept}`) : when ? "Schedule" : "Add"}
            primaryGlyph={Check}
            removed={drafts.flatMap((d, i) => (off.has(i) ? [d.title ?? `task ${i + 1}`] : []))}
            doneText={
                count > 1
                    ? `Added ${created.length || count} tasks.`
                    : when
                      ? `Scheduled “${title}” for ${when}.`
                      : `Added “${title}”.`
            }
        >
            {count === 1 ? (
                <>
                    <IdentityBlock
                        title={title}
                        subtitle={!persona.terse && first.note ? first.note : undefined}
                        icon={first.priority != null && !first.fromImage?.priority ? PRIORITY_OPTIONS.find((o) => o.value === first.priority)?.icon : undefined}
                        iconClassName={first.priority != null ? PRIORITY_CONFIG[first.priority].color : undefined}
                    />
                    <ImageQuote quote={first.fromImage?.title} />
                    <DraftDetails draft={first} />
                    <DraftSteps draft={first} />
                </>
            ) : (
                <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                    {drafts.map((draft, i) => (
                        <TickRow
                            key={i}
                            on={!off.has(i)}
                            onToggle={ctx.answer ? () => toggle(i) : undefined}
                            label={`Add ${draft.title ?? `task ${i + 1}`}`}
                        >
                            <p className="text-twilight-text">{draft.title}</p>
                            {draft.subtasks?.length ? (
                                <p className="text-[10px] text-twilight-text-muted">{draft.subtasks.length} steps</p>
                            ) : null}
                            <div className="mt-0.5 space-y-0.5">
                                <DraftDetails draft={draft} />
                            </div>
                        </TickRow>
                    ))}
                </div>
            )}
        </ApprovalCard>
    );
}
