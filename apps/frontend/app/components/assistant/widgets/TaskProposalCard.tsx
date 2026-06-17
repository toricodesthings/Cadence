import React from "react";
import { Sparkles, Calendar, Clock, Check, Pencil } from "lucide-react";
import { ProposalCard, IdentityBlock, MetaPill, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useCreateTask } from "../../../hooks/tasks/use-create-task";
import { useUpdateTask } from "../../../hooks/tasks/use-update-task";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";
import type { CreateTaskInput, UpdateTaskInput } from "@cadence/contracts/task";

/**
 * The proposed task draft the assistant streams as the tool part `input`. It is a
 * CreateTaskInput (for `propose_create_task`) plus the update-only addressing
 * fields (`taskId`/`state`/`waitingOn`) for `propose_update_task`. Typing it here
 * replaces the former `part.input: any` and guarantees the draft committed via the
 * REST hooks is a valid CreateTaskInput.
 */
type TaskProposalInput = Partial<CreateTaskInput> & {
    taskId?: string;
    state?: UpdateTaskInput["state"];
    waitingOn?: UpdateTaskInput["waitingOn"];
};

function formatDate(iso?: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
    const input = normalizeTaskWriteTemporalInput((ctx.part?.input ?? {}) as TaskProposalInput);

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        if (mode === "create") {
            await createTask.mutateAsync({
                title: input.title ?? "",
                orderIndex: Date.now(),
                ...(input.content !== undefined && { content: input.content }),
                ...(input.isAllDay !== undefined && { isAllDay: input.isAllDay }),
                ...(input.dueDate && { dueDate: input.dueDate }),
                ...(input.scheduledStart && { scheduledStart: input.scheduledStart }),
                ...(input.scheduledEnd && { scheduledEnd: input.scheduledEnd }),
                ...(input.durationEstimate != null && { durationEstimate: input.durationEstimate }),
                ...(input.projectId && { projectId: input.projectId }),
                ...(input.tagIds?.length ? { tagIds: input.tagIds } : {}),
                ...(input.priority != null && { priority: input.priority }),
            });
            return { title: input.title };
        }
        await updateTask.mutateAsync({
            id: input.taskId ?? "",
            ...(input.title !== undefined && { title: input.title }),
            ...(input.content !== undefined && { content: input.content }),
            ...(input.state !== undefined && { state: input.state }),
            ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
            ...(input.scheduledStart !== undefined && { scheduledStart: input.scheduledStart }),
            ...(input.scheduledEnd !== undefined && { scheduledEnd: input.scheduledEnd }),
            ...(input.durationEstimate !== undefined && { durationEstimate: input.durationEstimate }),
            ...(input.projectId !== undefined && { projectId: input.projectId }),
            ...(input.priority !== undefined && { priority: input.priority }),
            ...(input.waitingOn !== undefined && { waitingOn: input.waitingOn }),
        });
        return { title: input.title };
    });

    const title = input.title ?? "this task";
    const dateLabel = formatDate(input.scheduledStart ?? input.dueDate);
    const eyebrow = mode === "create" ? "SUGGESTED TASK" : "TASK UPDATE";
    const primaryLabel = mode === "update" ? "Update" : dateLabel ? "Schedule" : "Save";

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        const resolvedText = committed
            ? mode === "create"
                ? dateLabel
                    ? `Scheduled “${title}” for ${dateLabel}.`
                    : `Saved “${title}”.`
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
                subtitle={!persona.terse && input.content ? input.content : undefined}
            />
            <div className="flex flex-wrap gap-1.5">
                {dateLabel ? <MetaPill icon={Calendar}>{dateLabel}</MetaPill> : null}
                {input.durationEstimate ? (
                    <MetaPill icon={Clock}>{input.durationEstimate}m block</MetaPill>
                ) : null}
            </div>
        </ProposalCard>
    );
}
