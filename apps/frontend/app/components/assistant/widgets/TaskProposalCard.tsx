import { Sparkles, Calendar, Clock, Check, Pencil, TagIcon, Plus, Minus } from "lucide-react";
import { ProposalCard, IdentityBlock, MetaPill, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { formatWhen, useTagsLookup, useTaskTagIdsLookup, useTaskTitleLookup } from "./card-lookups";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "../../tasks/task-choice-options";
import { PRIORITY_CONFIG } from "../../../lib/constants/priority";
import { resolveTagColor } from "../../../lib/utils/color-resolver";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useCreateTask } from "../../../hooks/tasks/use-create-task";
import { useUpdateTask } from "../../../hooks/tasks/use-update-task";
import { useAddTaskTag, useRemoveTaskTag } from "../../../hooks/tags/use-task-tags";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";
import { inferIsAllDay } from "@cadence/domain/task-temporal";
import type { CreateTaskInput, UpdateTaskInput } from "@cadence/contracts/task";
import { NoteDiff, useNoteProposal, type NoteProposal } from "./note-proposal";

/**
 * The proposed task draft the assistant streams as the tool part `input`: task
 * fields (`propose_create_task`) plus the update-only addressing fields and the
 * note change (`propose_update_task`). No `isAllDay`: the values decide it.
 */
type TaskProposalInput = Partial<Omit<CreateTaskInput, "isAllDay" | "content">> &
    NoteProposal & {
        taskId?: string;
        state?: UpdateTaskInput["state"];
        waitingOn?: UpdateTaskInput["waitingOn"];
    };

/**
 * Suggestion card for `propose_create_task` / `propose_update_task` (design §4.1).
 * The evolution of the original draft card onto the shared ProposalCard shell.
 *
 * Confirm routes through the EXISTING REST hooks (useCreateTask / useUpdateTask)
 * — the one validated write path a human uses. `addToolResult` (in the resolver)
 * only reports the outcome back to the model; the hook performs the write.
 */
export function TaskProposalCard({
    ctx,
    state,
    mode,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
    mode: "create" | "update";
}) {
    const persona = useAssistantPersona();
    const createTask = useCreateTask();
    const updateTask = useUpdateTask();
    const lookupTitle = useTaskTitleLookup();
    const lookupTagIds = useTaskTagIdsLookup();
    const lookupTags = useTagsLookup();
    const addTag = useAddTaskTag();
    const removeTag = useRemoveTaskTag();
    const input = normalizeTaskWriteTemporalInput((ctx.part?.input ?? {}) as TaskProposalInput);
    // An update only carries the changed fields — name the task from the cached list.
    const title = input.title ?? (input.taskId ? lookupTitle(input.taskId) : "this task");
    // A clock time means timed, a plain date or a cleared start means all-day.
    const isAllDay = inferIsAllDay(input);
    const notes = useNoteProposal(mode === "update" ? input.taskId : undefined, input);

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async (idempotencyKey) => {
        if (mode === "create") {
            const created = await createTask.mutateAsync({
                title: input.title ?? "",
                orderIndex: Date.now(),
                idempotencyKey,
                ...(isAllDay !== undefined && { isAllDay }),
                ...(input.dueDate && { dueDate: input.dueDate }),
                ...(input.scheduledStart && { scheduledStart: input.scheduledStart }),
                ...(input.scheduledEnd && { scheduledEnd: input.scheduledEnd }),
                ...(input.durationEstimate != null && { durationEstimate: input.durationEstimate }),
                ...(input.projectId && { projectId: input.projectId }),
                ...(input.tagIds?.length ? { tagIds: input.tagIds } : {}),
                ...(input.priority != null && { priority: input.priority }),
                ...(input.effort != null && { effort: input.effort }),
            });
            if (created?.id) await notes.write(created.id);
            // The id lets a follow-up ("make it 6pm") update this task instead of re-creating it.
            return { title, taskId: created?.id };
        }
        // The note first: a refused or stale note change stops the card before anything else moves.
        await notes.write();
        const patch = {
            ...(input.title !== undefined && { title: input.title }),
            ...(isAllDay !== undefined && { isAllDay }),
            ...(input.state !== undefined && { state: input.state }),
            ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
            ...(input.scheduledStart !== undefined && { scheduledStart: input.scheduledStart }),
            ...(input.scheduledEnd !== undefined && { scheduledEnd: input.scheduledEnd }),
            ...(input.durationEstimate !== undefined && { durationEstimate: input.durationEstimate }),
            ...(input.projectId !== undefined && { projectId: input.projectId }),
            ...(input.priority !== undefined && { priority: input.priority }),
            ...(input.effort !== undefined && { effort: input.effort }),
            ...(input.waitingOn !== undefined && { waitingOn: input.waitingOn }),
        };
        if (Object.keys(patch).length) await updateTask.mutateAsync({ id: input.taskId ?? "", ...patch });
        // Tags live on their own endpoints: diff the proposed full set against the cache.
        if (input.tagIds && input.taskId) {
            const taskId = input.taskId;
            const current = lookupTagIds(taskId) ?? [];
            const next = input.tagIds;
            for (const tagId of next.filter((id) => !current.includes(id))) await addTag.mutateAsync({ taskId, tagId });
            for (const tagId of current.filter((id) => !next.includes(id))) await removeTag.mutateAsync({ taskId, tagId });
        }
        return { title };
    }, { destructive: mode === "update" && notes.removesText });

    const dateLabel = formatWhen(input.scheduledStart ?? input.dueDate);
    const effortOption = input.effort != null ? EFFORT_OPTIONS.find((o) => o.value === input.effort) : undefined;
    // Updates diff against the task's current tags: + added, − removed, plain = kept.
    const currentTagIds = mode === "update" && input.taskId ? lookupTagIds(input.taskId) : undefined;
    const nextTagIds = input.tagIds ?? [];
    const shownTags = input.tagIds ? lookupTags([...new Set([...nextTagIds, ...(currentTagIds ?? [])])]) : [];
    const tagChange = (id: string) =>
        !currentTagIds ? "kept" : !nextTagIds.includes(id) ? "removed" : currentTagIds.includes(id) ? "kept" : "added";
    // Only shown when the model explicitly set it — mirrors the left-edge bar TaskCard
    // uses to mark priority, so the same visual language carries into the proposal.
    const priorityOption = input.priority != null ? PRIORITY_OPTIONS.find((o) => o.value === input.priority) : undefined;
    // "Delete X" from the assistant means Trash (restorable), sent as a state update.
    const toTrash = mode === "update" && input.state === "ARCHIVED";
    const eyebrow = mode === "create" ? "SUGGESTED TASK" : toTrash ? "MOVE TO TRASH" : "TASK UPDATE";
    const primaryLabel = toTrash ? "Move to Trash" : mode === "update" ? "Update" : dateLabel ? "Schedule" : "Save";

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        const resolvedText = committed
            ? mode === "create"
                ? dateLabel
                    ? `Scheduled “${title}” for ${dateLabel}.`
                    : `Saved “${title}”.`
                : toTrash
                  ? `Moved “${title}” to Trash.`
                  : `Updated “${title}”.`
            : mode === "create"
              ? "Left as-is."
              : "Kept it as it was.";
        return (
            <ProposalCard
                state="output-available"
                eyebrow={eyebrow}
                eyebrowGlyph={Sparkles}
                ariaLabel={`${eyebrow}: ${title}`}
                primaryLabel={primaryLabel}
                resolvedCommitted={committed}
                resolvedText={resolvedText}
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            eyebrow={eyebrow}
            eyebrowGlyph={mode === "create" ? Sparkles : Pencil}
            ariaLabel={`${eyebrow}: ${title}`}
            primaryLabel={primaryLabel}
            primaryGlyph={Check}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            <IdentityBlock
                title={title}
                subtitle={mode === "create" && !persona.terse && input.note ? input.note : undefined}
                icon={priorityOption?.icon}
                iconClassName={input.priority != null ? PRIORITY_CONFIG[input.priority].color : undefined}
            />
            <div className="flex flex-wrap gap-1.5">
                {dateLabel ? <MetaPill icon={Calendar}>{dateLabel}</MetaPill> : null}
                {input.durationEstimate ? (
                    <MetaPill icon={Clock}>{input.durationEstimate}m block</MetaPill>
                ) : null}
                {effortOption ? <MetaPill icon={effortOption.icon}>{effortOption.label} effort</MetaPill> : null}
                {shownTags.map((tag) => {
                    const color = resolveTagColor(tag.color, "var(--color-twilight-text-soft)");
                    const change = tagChange(tag.id);
                    const MarkIcon = change === "added" ? Plus : change === "removed" ? Minus : TagIcon;
                    return (
                        <span
                            key={tag.id}
                            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${change === "removed" ? "line-through opacity-60" : ""}`}
                            style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
                            aria-label={change === "kept" ? `Tag ${tag.name}` : `${change === "added" ? "Add" : "Remove"} tag ${tag.name}`}
                        >
                            <MarkIcon size={10} aria-hidden="true" />
                            {tag.name}
                        </span>
                    );
                })}
            </div>
            {mode === "update" ? <NoteDiff diff={notes.diff} /> : null}
        </ProposalCard>
    );
}
