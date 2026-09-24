import { Pencil, Check, Calendar, Clock, Folder, Hourglass, Pin, Repeat, Plus, Minus } from "lucide-react";
import { IdentityBlock, MetaPill } from "./ProposalCard";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { formatWhen, useProjectNameLookup, useTagsLookup, useTaskTitleLookup } from "./card-lookups";
import { NoteDiff, useNoteProposal, type NoteProposal } from "./note-proposal";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "../../tasks/task-choice-options";
import { resolveTagColor } from "../../../lib/utils/color-resolver";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";
import type { UpdateTaskInput } from "@cadence/contracts/task";

/** The change `update_tasks` applies to every listed task. */
type TaskPatch = Partial<Pick<UpdateTaskInput,
    "title" | "dueDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "projectId" | "priority" | "effort" |
    "waitingOn" | "isPinned" | "recurrenceRule">> &
    NoteProposal & { addTagIds?: string[]; removeTagIds?: string[] };

/** Card for `update_tasks` (design §4.1): what changes, on one task or on rows the user can untick. */
export function UpdateTasksCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupTitle = useTaskTitleLookup();
    const lookupList = useProjectNameLookup();
    const lookupTags = useTagsLookup();
    const { off, toggle } = useUnticked();
    const taskIds: string[] = ctx.part?.input?.taskIds ?? [];
    const patch = normalizeTaskWriteTemporalInput((ctx.part?.input?.patch ?? {}) as TaskPatch);
    const count = taskIds.length;
    const kept = count - off.size;
    const title = count === 1 ? lookupTitle(taskIds[0]) : `${count} tasks`;
    const notes = useNoteProposal(count === 1 ? taskIds[0] : undefined, patch);

    const when = "scheduledStart" in patch || "dueDate" in patch ? (formatWhen(patch.scheduledStart ?? patch.dueDate) ?? "No date") : null;
    const priority = patch.priority != null ? PRIORITY_OPTIONS.find((o) => o.value === patch.priority) : undefined;
    const effort = patch.effort != null ? EFFORT_OPTIONS.find((o) => o.value === patch.effort) : undefined;
    const list = patch.projectId !== undefined ? (patch.projectId ? (lookupList(patch.projectId) ?? "another list") : "No list") : null;
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
            removed={taskIds.flatMap((id, i) => (off.has(i) ? [lookupTitle(id)] : []))}
            doneText={count > 1 ? `Updated ${updated ?? count} tasks.` : `Updated “${title}”.`}
            declinedText="Kept it as it was."
        >
            {count === 1 ? (
                <IdentityBlock title={title} subtitle={patch.title ? `Rename to “${patch.title}”` : undefined} />
            ) : (
                <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                    {taskIds.map((id, i) => (
                        <TickRow key={id} on={!off.has(i)} onToggle={ctx.answer ? () => toggle(i) : undefined} label={`Update ${lookupTitle(id)}`}>
                            {lookupTitle(id)}
                        </TickRow>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-1.5">
                {when ? <MetaPill icon={Calendar}>{when}</MetaPill> : null}
                {patch.durationEstimate != null ? <MetaPill icon={Clock}>{patch.durationEstimate}m block</MetaPill> : null}
                {list ? <MetaPill icon={Folder}>{list}</MetaPill> : null}
                {priority ? <MetaPill icon={priority.icon}>{priority.label} priority</MetaPill> : null}
                {effort ? <MetaPill icon={effort.icon}>{effort.label} effort</MetaPill> : null}
                {patch.waitingOn ? <MetaPill icon={Hourglass}>Waiting on {patch.waitingOn}</MetaPill> : null}
                {patch.isPinned !== undefined ? <MetaPill icon={Pin}>{patch.isPinned ? "Pin" : "Unpin"}</MetaPill> : null}
                {patch.recurrenceRule !== undefined ? <MetaPill icon={Repeat}>{patch.recurrenceRule ? "Repeats" : "Stops repeating"}</MetaPill> : null}
                {tags.map(({ tag, added }) => {
                    const color = resolveTagColor(tag.color, "var(--color-twilight-text-soft)");
                    const Mark = added ? Plus : Minus;
                    return (
                        <span
                            key={tag.id}
                            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${added ? "" : "line-through opacity-60"}`}
                            style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
                            aria-label={`${added ? "Add" : "Remove"} tag ${tag.name}`}
                        >
                            <Mark size={10} aria-hidden="true" />
                            {tag.name}
                        </span>
                    );
                })}
            </div>
            <NoteDiff diff={notes.diff} />
        </ApprovalCard>
    );
}
