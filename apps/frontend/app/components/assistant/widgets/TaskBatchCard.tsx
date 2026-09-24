import { Sparkles, Calendar, Clock, Check, ListChecks, Image as ImageIcon, Lock, Repeat, Folder } from "lucide-react";
import { IdentityBlock, MetaPill, TagPill } from "./ProposalCard";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { formatWhen, useProjectNameLookup, useTagsLookup } from "./card-lookups";
import { formatTime } from "../../../lib/utils/date-format";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "../../tasks/task-choice-options";
import { PRIORITY_CONFIG } from "../../../lib/constants/priority";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { getTaskRecurrenceSummary, normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";
import type { CreateTaskInput } from "@cadence/contracts/task";

type Quoted = "title" | "dueDate" | "scheduledStart" | "priority" | "subtasks" | "note";

/** A task as the assistant drafts it (`create_tasks`, `structure_inbox_item`). */
export type TaskDraft = Partial<Pick<CreateTaskInput, "title" | "dueDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "priority" | "effort" | "recurrenceRule" | "projectId" | "tagIds">> & {
    subtasks?: string[];
    fixed?: boolean;
    note?: string;
    /** Field → the exact words the image shows for it. */
    fromImage?: Partial<Record<Quoted, string>>;
};

/** How each quoted field is named in the "From your image" block, in reading order. */
const QUOTE_LABELS: Array<[Quoted, string]> = [
    ["title", "Title"],
    ["dueDate", "Due"],
    ["scheduledStart", "When"],
    ["priority", "Priority"],
    ["subtasks", "Steps"],
    ["note", "Note"],
];

/** "Mar 8, 9:00 AM – 10:30 AM" for a timed block, else the start or due date alone. */
function formatDraftWhen(draft: TaskDraft): string | null {
    const when = formatWhen(draft.scheduledStart ?? draft.dueDate);
    const start = draft.scheduledStart;
    const end = draft.scheduledEnd;
    if (!when || !start || !end || start.length === 10 || end.length === 10) return when;
    return start.slice(0, 10) === end.slice(0, 10) ? `${when} – ${formatTime(end)}` : `${when} – ${formatWhen(end)}`;
}

/**
 * The words the assistant copied from a photo, gathered in one place so the
 * card stays readable: labelled lines on a single task, one clamped line per row.
 */
export function DraftQuotes({ draft, compact = false }: { draft: TaskDraft; compact?: boolean }) {
    const quotes = QUOTE_LABELS.flatMap(([field, label]) => {
        const quote = draft.fromImage?.[field]?.trim();
        return quote ? [{ label, quote }] : [];
    });
    if (quotes.length === 0) return null;
    if (compact) {
        return (
            <p className="flex items-center gap-1 text-[10px] text-twilight-text-muted">
                <ImageIcon size={10} className="shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">From your image: {quotes.map((q) => `“${q.quote}”`).join(" · ")}</span>
            </p>
        );
    }
    return (
        <div className="rounded-lg border border-white/[0.05] px-2.5 py-1.5 text-[11px] text-twilight-text-muted">
            <p className="mb-0.5 flex items-center gap-1 font-medium text-twilight-text-soft">
                <ImageIcon size={11} className="shrink-0" aria-hidden="true" />
                From your image
            </p>
            {quotes.map(({ label, quote }) => (
                <p key={label} className="line-clamp-2">
                    {label}: “{quote}”
                </p>
            ))}
        </div>
    );
}

/** Every field a draft sets, as pills: when (with its end), length, priority, effort, repeats, Fixed, list, tags. */
export function DraftDetails({ draft }: { draft: TaskDraft }) {
    const lookupList = useProjectNameLookup();
    const lookupTags = useTagsLookup();
    const when = formatDraftWhen(draft);
    const priority = draft.priority ? PRIORITY_OPTIONS.find((o) => o.value === draft.priority) : undefined;
    const effort = draft.effort != null ? EFFORT_OPTIONS.find((o) => o.value === draft.effort) : undefined;
    const repeats = draft.recurrenceRule
        ? (getTaskRecurrenceSummary({ recurrenceRule: draft.recurrenceRule, scheduledStart: null, scheduledEnd: null })?.cadenceLabel ?? "Repeats")
        : null;
    const list = draft.projectId ? (lookupList(draft.projectId) ?? "A list") : null;
    const tags = lookupTags(draft.tagIds ?? []);
    if (!when && !draft.durationEstimate && !priority && !effort && !repeats && !draft.fixed && !list && tags.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {when ? <MetaPill icon={Calendar}>{when}</MetaPill> : null}
            {draft.durationEstimate ? <MetaPill icon={Clock}>{draft.durationEstimate}m block</MetaPill> : null}
            {priority ? (
                <MetaPill icon={priority.icon}>
                    <span className={PRIORITY_CONFIG[draft.priority!].color}>{priority.label} priority</span>
                </MetaPill>
            ) : null}
            {effort ? <MetaPill icon={effort.icon}>{effort.label} effort</MetaPill> : null}
            {repeats ? <MetaPill icon={Repeat}>{repeats}</MetaPill> : null}
            {draft.fixed ? <MetaPill icon={Lock}>Fixed</MetaPill> : null}
            {list ? <MetaPill icon={Folder}>{list}</MetaPill> : null}
            {tags.map((tag) => (
                <TagPill key={tag.id} tag={tag} />
            ))}
        </div>
    );
}

/** A draft's note, kept to a few lines so a long one can't push the buttons off screen. */
export function DraftNote({ note, lines = 3 }: { note?: string; lines?: 1 | 3 }) {
    if (!note?.trim()) return null;
    return (
        <p className={`whitespace-pre-line text-[11px] text-twilight-text-muted ${lines === 1 ? "line-clamp-1" : "line-clamp-3"}`}>
            {note}
        </p>
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
        </div>
    );
}

/**
 * Card for `create_tasks` (design §4.1): one task shows whole, with its checklist;
 * several show as rows the user can untick. One tap adds them all.
 */
export function TaskBatchCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const { off, onToggle, removed } = useUnticked(ctx);
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
            removed={removed(drafts.map((d, i) => d.title ?? `task ${i + 1}`))}
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
                        subtitle={!persona.terse && first.note ? <DraftNote note={first.note} /> : undefined}
                    />
                    <DraftDetails draft={first} />
                    <DraftSteps draft={first} />
                    <DraftQuotes draft={first} />
                </>
            ) : (
                <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                    {drafts.map((draft, i) => (
                        <TickRow
                            key={i}
                            on={!off.has(i)}
                            onToggle={onToggle(i)}
                            label={`Add ${draft.title ?? `task ${i + 1}`}`}
                        >
                            <p className="text-twilight-text">{draft.title}</p>
                            {!persona.terse ? <DraftNote note={draft.note} lines={1} /> : null}
                            {draft.subtasks?.length ? (
                                <p className="text-[10px] text-twilight-text-muted">
                                    {draft.subtasks.length} {draft.subtasks.length === 1 ? "step" : "steps"}
                                </p>
                            ) : null}
                            <div className="mt-0.5 space-y-0.5">
                                <DraftDetails draft={draft} />
                                <DraftQuotes draft={draft} compact />
                            </div>
                        </TickRow>
                    ))}
                </div>
            )}
        </ApprovalCard>
    );
}
