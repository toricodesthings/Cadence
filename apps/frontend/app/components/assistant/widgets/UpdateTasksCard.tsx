import { Pencil, Check, Calendar, Hourglass, Pin, Repeat, Bell, BellOff, Eye, EyeOff, Lock, Unlock, CalendarClock, UserCheck } from "lucide-react";
import { IdentityBlock, MetaPills, TagPill, type MaybePill, type Pill } from "./ProposalCard";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { formatWhen, useTagsLookup, useTaskTitleLookup, useTaskLookup } from "./card-lookups";
import { TaskDestination } from "./TaskDestination";
import { TagNamePills } from "./TaskBatchCard";
import { NoteDiff, useNoteProposal } from "./note-proposal";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "../../tasks/task-choice-options";

type TaskPatch = NonNullable<NonNullable<NonNullable<ToolRenderContext<"update_tasks">["part"]>["input"]>["patch"]>;

/** When it happens and for how long. */
function timePills(patch: TaskPatch): MaybePill[] {
    const when = "scheduledStart" in patch || "dueDate" in patch ? (formatWhen(patch.scheduledStart ?? patch.dueDate) ?? "No date") : null;
    return [
        when ? { icon: Calendar, label: when } : null,
        patch.durationEstimate != null ? { icon: Hourglass, label: `${patch.durationEstimate}m block` } : null,
    ];
}

/** Every other field the patch sets or clears, in words. */
function changePills(patch: TaskPatch): MaybePill[] {
    const priority = patch.priority != null ? PRIORITY_OPTIONS.find((o) => o.value === patch.priority) : undefined;
    const effort = patch.effort != null ? EFFORT_OPTIONS.find((o) => o.value === patch.effort) : undefined;
    const set = <T,>(value: T | undefined, pill: (value: T) => Pill) => (value === undefined ? null : pill(value));
    return [
        priority ? { icon: priority.icon, label: `${priority.label} priority` } : null,
        effort ? { icon: effort.icon, label: `${effort.label} effort` } : null,
        patch.waitingOn ? { icon: UserCheck, label: `Waiting on ${patch.waitingOn}` } : null,
        set(patch.isPinned, (on) => ({ icon: Pin, label: on ? "Pin" : "Unpin" })),
        set(patch.recurrenceRule, (rule) => ({ icon: Repeat, label: rule ? "Repeats" : "Stops repeating" })),
        set(patch.reminderAt, (at) => (at ? { icon: Bell, label: `Remind ${formatWhen(at)}` } : { icon: BellOff, label: "No reminder" })),
        set(patch.checkInAt, (at) => ({ icon: CalendarClock, label: at ? `Check in ${formatWhen(at)}` : "No check-in" })),
        set(patch.hideUntil, (day) => (day ? { icon: EyeOff, label: `Hidden until ${formatWhen(day)}` } : { icon: Eye, label: "Always shown" })),
        set(patch.fixed, (fixed) => ({ icon: fixed ? Lock : Unlock, label: fixed ? "Make it Fixed" : "Make it a task" })),
    ];
}

/** The card's words for one task or several (counting only the rows still ticked). */
function updateCardText(count: number, kept: number, title: string, updated: number | undefined) {
    if (count > 1) {
        return { eyebrow: `UPDATE ${count} TASKS`, primaryLabel: count > kept ? `Update ${kept}` : "Update", doneText: `Updated ${updated ?? count} tasks.` };
    }
    return { eyebrow: "TASK UPDATE", primaryLabel: "Update", doneText: `Updated “${title}”.` };
}

/** Tags the patch adds, then those it takes off. */
function useTagChanges(patch: TaskPatch) {
    const lookupTags = useTagsLookup();
    return [
        ...lookupTags(patch.addTagIds ?? []).map((tag) => ({ tag, added: true })),
        ...lookupTags(patch.removeTagIds ?? []).map((tag) => ({ tag, added: false })),
    ];
}

type UpdateTargetsProps = {
    taskIds: string[];
    title: string;
    rename?: string;
    off: ReadonlySet<number>;
    onToggle: (i: number) => (() => void) | undefined;
};

/** One task by name (with its rename), or a row per task the user can untick. */
function UpdateTargets({ taskIds, title, rename, off, onToggle }: UpdateTargetsProps) {
    const lookupTitle = useTaskTitleLookup();
    if (taskIds.length === 1) return <IdentityBlock title={title} subtitle={rename ? `Rename to “${rename}”` : undefined} />;
    return (
        <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
            {taskIds.map((id, i) => (
                <TickRow key={id} on={!off.has(i)} onToggle={onToggle(i)} label={`Update ${lookupTitle(id)}`}>
                    {lookupTitle(id)}
                </TickRow>
            ))}
        </div>
    );
}

/** Every change as pills: time, destination (in the first task's list unless it moves), the rest, then tags. */
function UpdatePills({ patch, firstTaskId }: { patch: TaskPatch; firstTaskId: string | undefined }) {
    const lookupTask = useTaskLookup();
    const tags = useTagChanges(patch);
    const changesDestination = patch.projectId !== undefined || patch.sectionId !== undefined;
    const projectId = patch.projectId !== undefined ? patch.projectId : lookupTask(firstTaskId!)?.projectId;
    return (
        <div className="flex flex-wrap gap-1.5">
            <MetaPills pills={timePills(patch)} />
            {changesDestination ? <TaskDestination projectId={projectId} sectionId={patch.sectionId} /> : null}
            <MetaPills pills={changePills(patch)} />
            {tags.map(({ tag, added }) => (
                <TagPill key={tag.id} tag={tag} mark={added ? "add" : "remove"} />
            ))}
            <TagNamePills names={patch.addTagNames} mark="add" />
        </div>
    );
}

/** Card for `update_tasks` (design §4.1): what changes, on one task or on rows the user can untick. */
export function UpdateTasksCard({ ctx }: { ctx: ToolRenderContext<"update_tasks"> }) {
    const lookupTitle = useTaskTitleLookup();
    const { off, onToggle, removed } = useUnticked(ctx);
    const taskIds: string[] = ctx.part?.input?.taskIds ?? [];
    const patch = ctx.part?.input?.patch ?? {};
    const count = taskIds.length;
    const title = count === 1 ? lookupTitle(taskIds[0]) : `${count} tasks`;
    const notes = useNoteProposal(count === 1 ? taskIds[0] : undefined, patch);

    const text = updateCardText(count, count - off.size, title, ctx.part?.output?.updated);

    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow={text.eyebrow}
            eyebrowGlyph={Pencil}
            ariaLabel={`Update ${title}`}
            primaryLabel={text.primaryLabel}
            primaryGlyph={Check}
            removed={removed(taskIds.map(lookupTitle))}
            doneText={text.doneText}
            declinedText="Kept it as it was."
        >
            <UpdateTargets taskIds={taskIds} title={title} rename={patch.title} off={off} onToggle={onToggle} />
            <UpdatePills patch={patch} firstTaskId={taskIds[0]} />
            <NoteDiff diff={notes.diff} />
        </ApprovalCard>
    );
}
