import { ListChecks, Check, Pencil, Trash2, AlertCircle } from "lucide-react";
import { ProposalCard, IdentityBlock, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useTaskTitleLookup } from "./card-lookups";
import { useCreateSubtask, useDeleteSubtask, useSubtasks, useUpdateSubtask } from "../../../hooks/tasks/use-subtasks";

type Mode = "add" | "update" | "delete";

const COPY: Record<Mode, { eyebrow: string; primary: string }> = {
    add: { eyebrow: "NEW SUBTASK", primary: "Add" },
    update: { eyebrow: "SUBTASK UPDATE", primary: "Update" },
    delete: { eyebrow: "DELETE SUBTASK", primary: "Delete it" },
};

/** Suggestion card for `propose_add_subtask` / `propose_update_subtask` / `propose_delete_subtask`. */
export function SubtaskCard({ ctx, state, mode }: { ctx: ToolRenderContext; state: ProposalCardState; mode: Mode }) {
    const input = ctx.part?.input ?? {};
    const taskId: string = input.taskId ?? "";
    const createSubtask = useCreateSubtask(taskId);
    const updateSubtask = useUpdateSubtask(taskId);
    const deleteSubtask = useDeleteSubtask(taskId);
    // An update may only tick it off — fetch the current title (update mode only).
    const { data: siblings } = useSubtasks(mode === "update" ? taskId : "");
    const lookupTitle = useTaskTitleLookup();
    const parent = taskId ? lookupTitle(taskId) : "this task";
    const current = siblings?.find((s) => s.id === input.subtaskId)?.title;
    const title: string = input.title ?? current ?? "this step";

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        if (mode === "add") {
            // Date.now() appends after existing steps, same as task creation does.
            const created = await createSubtask.mutateAsync({ title, orderIndex: Date.now() });
            return { title, subtaskId: created?.id, taskId };
        }
        if (mode === "update") {
            await updateSubtask.mutateAsync({
                id: input.subtaskId,
                ...(input.title !== undefined && { title: input.title }),
                ...(input.isComplete !== undefined && { isComplete: input.isComplete }),
            });
            return { title };
        }
        await deleteSubtask.mutateAsync(input.subtaskId);
        return { title };
    }, { destructive: mode === "delete" });

    const { eyebrow, primary } = COPY[mode];
    const glyph = mode === "add" ? ListChecks : mode === "update" ? Pencil : AlertCircle;
    const tone = mode === "delete" ? "danger" : undefined;
    const change =
        mode === "update"
            ? [
                  input.title !== undefined && current && current !== input.title ? `Renamed from “${current}”` : null,
                  input.isComplete === true ? "Mark done" : input.isComplete === false ? "Mark not done" : null,
              ]
                  .filter(Boolean)
                  .join(" · ")
            : "";

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        const done = { add: `Added “${title}” to “${parent}”.`, update: `Updated “${title}”.`, delete: `Deleted “${title}”.` };
        return (
            <ProposalCard
                state="output-available"
                tone={tone}
                eyebrow={eyebrow}
                eyebrowGlyph={glyph}
                ariaLabel={`${eyebrow}: ${title}`}
                primaryLabel={primary}
                resolvedCommitted={committed}
                resolvedText={committed ? done[mode] : mode === "delete" ? "Kept it." : "Left as-is."}
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            tone={tone}
            eyebrow={eyebrow}
            eyebrowGlyph={glyph}
            ariaLabel={`${eyebrow}: ${title}`}
            primaryLabel={primary}
            primaryGlyph={mode === "delete" ? Trash2 : Check}
            {...(mode === "delete" && { primaryVariant: "cardDanger" as const, declineLabel: "Keep it" })}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            <IdentityBlock
                tone={tone}
                title={title}
                subtitle={[`Under “${parent}”`, change].filter(Boolean).join(" · ")}
            />
        </ProposalCard>
    );
}
