import { Pencil, Check, Calendar, Clock, Hourglass, Pin, Repeat, Bell, BellOff, Eye, EyeOff, Lock, Unlock, CalendarClock } from "lucide-react";
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
        patch.durationEstimate != null ? { icon: Clock, label: `${patch.durationEstimate}m block` } : null,
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
        patch.waitingOn ? { icon: Hourglass, label: `Waiting on ${patch.waitingOn}` } : null,
        set(patch.isPinned, (on) => ({ icon: Pin, label: on ? "Pin" : "Unpin" })),
        set(patch.recurrenceRule, (rule) => ({ icon: Repeat, label: rule ? "Repeats" : "Stops repeating" })),
        set(patch.reminderAt, (at) => (at ? { icon: Bell, label: `Remind ${formatWhen(at)}` } : { icon: BellOff, label: "No reminder" })),
        set(patch.checkInAt, (at) => ({ icon: CalendarClock, label: at ? `Check in ${formatWhen(at)}` : "No check-in" })),
        set(patch.hideUntil, (day) => (day ? { icon: EyeOff, label: `Hidden until ${formatWhen(day)}` } : { icon: Eye, label: "Always shown" })),
        set(patch.fixed, (fixed) => ({ icon: fixed ? Lock : Unlock, label: fixed ? "Make it Fixed" : "Make it a task" })),
    ];
}

/** Card for `update_tasks` (design §4.1): what changes, on one task or on rows the user can untick. */
export function UpdateTasksCard({ ctx }: { ctx: ToolRenderContext<"update_tasks"> }) {
    const lookupTitle = useTaskTitleLookup();
    const lookupTask = useTaskLookup();
    const lookupTags = useTagsLookup();
    const { off, onToggle, removed } = useUnticked(ctx);
    const taskIds: string[] = ctx.part?.input?.taskIds ?? [];
    const patch = ctx.part?.input?.patch ?? {};
    const count = taskIds.length;
    const kept = count - off.size;
    const title = count === 1 ? lookupTitle(taskIds[0]) : `${count} tasks`;
    const notes = useNoteProposal(count === 1 ? taskIds[0] : undefined, patch);

    const changesDestination = patch.projectId !== undefined || patch.sectionId !== undefined;
    const projectId = patch.projectId !== undefined ? patch.projectId : lookupTask(taskIds[0])?.projectId;
    const tags = [
        ...lookupTags(patch.addTagIds ?? []).map((tag) => ({ tag, added: true })),
        ...lookupTags(patch.removeTagIds ?? []).map((tag) => ({ tag, added: false })),
    ];
    const updated: number | undefined = ctx.part?.output?.updated;

    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow={count > 1 ? `UPDATE ${count} TASKS` : "TASK UPDATE"}
            eyebrowGlyph={Pencil}
            ariaLabel={`Update ${title}`}
            primaryLabel={count > 1 && kept < count ? `Update ${kept}` : "Update"}
            primaryGlyph={Check}
            removed={removed(taskIds.map(lookupTitle))}
            doneText={count > 1 ? `Updated ${updated ?? count} tasks.` : `Updated “${title}”.`}
            declinedText="Kept it as it was."
        >
            {count === 1 ? (
                <IdentityBlock title={title} subtitle={patch.title ? `Rename to “${patch.title}”` : undefined} />
            ) : (
                <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                    {taskIds.map((id, i) => (
                        <TickRow key={id} on={!off.has(i)} onToggle={onToggle(i)} label={`Update ${lookupTitle(id)}`}>
                            {lookupTitle(id)}
                        </TickRow>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-1.5">
                <MetaPills pills={timePills(patch)} />
                {changesDestination ? <TaskDestination projectId={projectId} sectionId={patch.sectionId} /> : null}
                <MetaPills pills={changePills(patch)} />
                {tags.map(({ tag, added }) => (
                    <TagPill key={tag.id} tag={tag} mark={added ? "add" : "remove"} />
                ))}
                <TagNamePills names={patch.addTagNames} mark="add" />
            </div>
            <NoteDiff diff={notes.diff} />
        </ApprovalCard>
    );
}
