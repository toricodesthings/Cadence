import { Pencil, Check, Calendar, Clock, Hourglass, Pin, Repeat } from "lucide-react";
import { IdentityBlock, MetaPill, TagPill } from "./ProposalCard";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { formatWhen, useTagsLookup, useTaskTitleLookup, useTaskLookup } from "./card-lookups";
import { TaskDestination } from "./TaskDestination";
import { NoteDiff, useNoteProposal, type NoteProposal } from "./note-proposal";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "../../tasks/task-choice-options";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";
import type { UpdateTaskInput } from "@cadence/contracts/task";

/** The change `update_tasks` applies to every listed task. */
type TaskPatch = Partial<Pick<UpdateTaskInput,
    "title" | "dueDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "projectId" | "sectionId" | "priority" | "effort" |
    "waitingOn" | "isPinned" | "recurrenceRule">> &
    NoteProposal & { addTagIds?: string[]; removeTagIds?: string[] };

/** Card for `update_tasks` (design §4.1): what changes, on one task or on rows the user can untick. */
export function UpdateTasksCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupTitle = useTaskTitleLookup();
    const lookupTask = useTaskLookup();
    const lookupTags = useTagsLookup();
    const { off, onToggle, removed } = useUnticked(ctx);
    const taskIds: string[] = ctx.part?.input?.taskIds ?? [];
    const patch = normalizeTaskWriteTemporalInput((ctx.part?.input?.patch ?? {}) as TaskPatch);
    const count = taskIds.length;
    const kept = count - off.size;
    const title = count === 1 ? lookupTitle(taskIds[0]) : `${count} tasks`;
    const notes = useNoteProposal(count === 1 ? taskIds[0] : undefined, patch);

    const when = "scheduledStart" in patch || "dueDate" in patch ? (formatWhen(patch.scheduledStart ?? patch.dueDate) ?? "No date") : null;
    const priority = patch.priority != null ? PRIORITY_OPTIONS.find((o) => o.value === patch.priority) : undefined;
    const effort = patch.effort != null ? EFFORT_OPTIONS.find((o) => o.value === patch.effort) : undefined;
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
                {when ? <MetaPill icon={Calendar}>{when}</MetaPill> : null}
                {patch.durationEstimate != null ? <MetaPill icon={Clock}>{patch.durationEstimate}m block</MetaPill> : null}
                {changesDestination ? <TaskDestination projectId={projectId} sectionId={patch.sectionId} /> : null}
                {priority ? <MetaPill icon={priority.icon}>{priority.label} priority</MetaPill> : null}
                {effort ? <MetaPill icon={effort.icon}>{effort.label} effort</MetaPill> : null}
                {patch.waitingOn ? <MetaPill icon={Hourglass}>Waiting on {patch.waitingOn}</MetaPill> : null}
                {patch.isPinned !== undefined ? <MetaPill icon={Pin}>{patch.isPinned ? "Pin" : "Unpin"}</MetaPill> : null}
                {patch.recurrenceRule !== undefined ? <MetaPill icon={Repeat}>{patch.recurrenceRule ? "Repeats" : "Stops repeating"}</MetaPill> : null}
                {tags.map(({ tag, added }) => (
                    <TagPill key={tag.id} tag={tag} mark={added ? "add" : "remove"} />
                ))}
            </div>
            <NoteDiff diff={notes.diff} />
        </ApprovalCard>
    );
}
