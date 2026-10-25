import { Sparkles, Calendar, Check, ListChecks, Image as ImageIcon, Lock, Repeat, Bell, EyeOff, Tag as TagIcon, Hourglass } from "lucide-react";
import { IdentityBlock, MetaPill, MetaPills, TagPill, type MaybePill } from "./ProposalCard";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { formatWhen, useTagsLookup } from "./card-lookups";
import { TaskDestination } from "./TaskDestination";
import { isLocalDate } from "@cadence/domain/time";
import { dayOfInstant, formatTime } from "../../../lib/utils/date-format";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "../../tasks/task-choice-options";
import { PRIORITY_CONFIG } from "../../../lib/constants/priority";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { getTaskRecurrenceSummary } from "../../../lib/utils/task/task-scheduling";
import type { CreateTaskInput } from "@cadence/contracts/task";
import { effortName } from "@cadence/domain/effort-evidence";
import { useState } from "react";
import { useUpdateTask } from "../../../hooks/tasks/use-update-task";
import { useTask } from "../../../hooks/tasks/use-tasks";

type Quoted = "title" | "dueDate" | "scheduledStart" | "priority" | "subtasks" | "note";

/** A task as the assistant drafts it (`create_tasks`, `structure_inbox_item`). */
export type TaskDraft = Partial<Pick<CreateTaskInput, "title" | "dueDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "priority" | "effort" | "recurrenceRule" | "projectId" | "sectionId" | "tagIds">> & {
    subtasks?: string[];
    fixed?: boolean;
    note?: string;
    /** Tags by name; a new name makes the tag. */
    tagNames?: string[];
    reminderAt?: string | null;
    /** Hidden from lists until this local day. */
    hideUntil?: string | null;
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
    if (!when || !start || !end || isLocalDate(start) || isLocalDate(end)) return when;
    return dayOfInstant(start) === dayOfInstant(end) ? `${when} – ${formatTime(end)}` : `${when} – ${formatWhen(end)}`;
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

/** Tags named by the assistant (new ones are made when the change lands). */
export function TagNamePills({ names, mark }: { names?: string[]; mark?: "add" }) {
    return <>{names?.map((name) => <MetaPill key={name} icon={TagIcon}>{`${mark ? "+ " : ""}#${name}`}</MetaPill>)}</>;
}

/** The draft's fields that read as pills: when, length, priority, effort, repeats, Fixed, reminder, hide-until. */
function draftPills(draft: TaskDraft): MaybePill[] {
    const when = formatDraftWhen(draft);
    const priority = draft.priority ? PRIORITY_OPTIONS.find((o) => o.value === draft.priority) : undefined;
    const effort = draft.effort != null ? EFFORT_OPTIONS.find((o) => o.value === draft.effort) : undefined;
    const repeats = draft.recurrenceRule
        ? (getTaskRecurrenceSummary({ recurrenceRule: draft.recurrenceRule, scheduledStart: null, scheduledEnd: null })?.cadenceLabel ?? "Repeats")
        : null;
    const reminder = formatWhen(draft.reminderAt);
    const hidden = formatWhen(draft.hideUntil);
    return [
        when && { icon: Calendar, label: when },
        draft.durationEstimate && { icon: Hourglass, label: `${draft.durationEstimate}m block` },
        priority && { icon: priority.icon, label: <span className={PRIORITY_CONFIG[priority.value].color}>{priority.label} priority</span> },
        effort && { icon: effort.icon, label: `${effort.label} effort` },
        repeats && { icon: Repeat, label: repeats },
        draft.fixed && { icon: Lock, label: "Fixed" },
        reminder && { icon: Bell, label: `Remind ${reminder}` },
        hidden && { icon: EyeOff, label: `Hidden until ${hidden}` },
    ];
}

/** Every field a draft sets, as pills: those above, then destination and tags. */
export function DraftDetails({ draft }: { draft: TaskDraft }) {
    const lookupTags = useTagsLookup();
    const pills = draftPills(draft);
    const tags = lookupTags(draft.tagIds ?? []);
    if (!pills.some(Boolean) && !draft.projectId && !draft.sectionId && tags.length === 0 && !draft.tagNames?.length) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            <MetaPills pills={pills} />
            <TaskDestination projectId={draft.projectId ?? undefined} sectionId={draft.sectionId ?? undefined} />
            {tags.map((tag) => (
                <TagPill key={tag.id} tag={tag} />
            ))}
            <TagNamePills names={draft.tagNames} />
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
/** The card's words: one task by title (Schedule when it has a time), several by count. */
function batchCardText(drafts: TaskDraft[], kept: number, createdCount: number) {
    const count = drafts.length;
    const first = drafts[0] ?? {};
    const title = first.title ?? "this task";
    if (count > 1) {
        const eyebrow = `${count} NEW TASKS`;
        return {
            title,
            eyebrow,
            ariaLabel: eyebrow,
            primaryLabel: kept === count ? `Add all ${count}` : `Add ${kept}`,
            doneText: `Added ${createdCount || count} tasks.`,
        };
    }
    const when = formatWhen(first.scheduledStart ?? first.dueDate);
    return {
        title,
        eyebrow: "NEW TASK",
        ariaLabel: `NEW TASK: ${title}`,
        primaryLabel: when ? "Schedule" : "Add",
        doneText: when ? `Scheduled “${title}” for ${when}.` : `Added “${title}”.`,
    };
}

const draftLabel = (draft: TaskDraft, i: number) => draft.title ?? `task ${i + 1}`;

/** One of several drafts: its title, note line, step count and details, untickable. */
type DraftRowProps = { draft: TaskDraft; i: number; on: boolean; onToggle: (() => void) | undefined; terse: boolean };

function DraftRow({ draft, i, on, onToggle, terse }: DraftRowProps) {
    const steps = draft.subtasks?.length ?? 0;
    return (
        <TickRow on={on} onToggle={onToggle} label={`Add ${draftLabel(draft, i)}`}>
            <p className="text-twilight-text">{draft.title}</p>
            {!terse ? <DraftNote note={draft.note} lines={1} /> : null}
            {steps ? (
                <p className="text-[10px] text-twilight-text-muted">
                    {steps} {steps === 1 ? "step" : "steps"}
                </p>
            ) : null}
            <div className="mt-0.5 space-y-0.5">
                <DraftDetails draft={draft} />
                <DraftQuotes draft={draft} compact />
            </div>
        </TickRow>
    );
}

type Created = { taskId: string; title: string; effortGuess?: 1 | 2 | 3 };

/** "~High effort · Use": a guess from their own Effort choices, kept only on a tap. */
/** One created task's guess, read against the live task: gone once it has an Effort (or is gone), "kept · Undo" after Use. */
function EffortGuessPill({ taskId, title, effortGuess, named }: Created & { named: boolean }) {
    const updateTask = useUpdateTask();
    const task = useTask(taskId);
    const [used, setUsed] = useState(false);
    const level = effortGuess!;
    if (!task || task.state === "ARCHIVED" || (task.effort != null && !(used && task.effort === level))) return null;
    const name = `${effortName(level)} effort${named ? ` (${title})` : ""}`;
    if (used) {
        return (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-twilight-border px-2.5 text-[11px] text-twilight-text-soft">
                <Check size={11} aria-hidden="true" /> {name} kept
                <button
                    type="button"
                    onClick={() => { setUsed(false); updateTask.mutate({ id: taskId, effort: null }); }}
                    className="cursor-pointer underline-offset-2 hover:underline"
                >
                    Undo
                </button>
            </span>
        );
    }
    return (
        <button
            type="button"
            onClick={() => { setUsed(true); updateTask.mutate({ id: taskId, effort: level, effortOrigin: "accepted" }); }}
            aria-label={`Use ${effortName(level)} effort for ${title}`}
            className="min-h-8 cursor-pointer rounded-full border border-twilight-border px-2.5 text-[11px] text-twilight-text-soft hover:border-twilight-text-muted/40"
        >
            <span aria-hidden="true">~</span>{name} · Use
        </button>
    );
}

function EffortGuessPills({ created }: { created: Created[] }) {
    const guessed = created.filter((c) => c.effortGuess);
    if (!guessed.length) return null;
    return (
        <div className="flex flex-wrap gap-1.5 px-1 pt-1.5">
            {guessed.map((c) => <EffortGuessPill key={c.taskId} {...c} named={guessed.length > 1} />)}
        </div>
    );
}

/**
 * Card for `create_tasks` (design §4.1): one task shows whole, with its checklist;
 * several show as rows the user can untick. One tap adds them all.
 */
export function TaskBatchCard({ ctx }: { ctx: ToolRenderContext<"create_tasks"> }) {
    const persona = useAssistantPersona();
    const { off, onToggle, removed } = useUnticked(ctx);
    const drafts: TaskDraft[] = ctx.part?.input?.tasks ?? [];
    const created: unknown[] = ctx.part?.output?.created ?? [];
    const { title, eyebrow, ariaLabel, primaryLabel, doneText } = batchCardText(drafts, drafts.length - off.size, created.length);
    const first = drafts[0] ?? {};

    return (
        <>
            <ApprovalCard
                ctx={ctx}
                eyebrow={eyebrow}
                eyebrowGlyph={Sparkles}
                ariaLabel={ariaLabel}
                primaryLabel={primaryLabel}
                primaryGlyph={Check}
                removed={removed(drafts.map(draftLabel))}
                doneText={doneText}
            >
                {drafts.length === 1 ? (
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
                            <DraftRow key={i} draft={draft} i={i} on={!off.has(i)} onToggle={onToggle(i)} terse={persona.terse} />
                        ))}
                    </div>
                )}
            </ApprovalCard>
            <EffortGuessPills created={created as Created[]} />
        </>
    );
}
