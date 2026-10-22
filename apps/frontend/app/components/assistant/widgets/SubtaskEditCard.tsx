import { ListChecks, Check, Trash2 } from "lucide-react";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { useTaskTitleLookup } from "./card-lookups";
import { useSubtasks } from "../../../hooks/tasks/use-subtasks";

interface SubtaskEdit {
    taskId?: string;
    add?: string[];
    update?: { subtaskId: string; title?: string; isComplete?: boolean }[];
    remove?: { subtaskId: string; title: string }[];
    order?: string[];
}

type ChecklistRow = { label: string; text: string; remove: boolean };

/** "tick off, rename to “New”" */
function changeText(change: NonNullable<SubtaskEdit["update"]>[number]) {
    return [
        change.isComplete === true ? "tick off" : change.isComplete === false ? "untick" : null,
        change.title !== undefined ? `rename to “${change.title}”` : null,
    ].filter(Boolean).join(", ");
}

/** One row per change: adds, edits, removals, then a reorder. */
function checklistRows(input: SubtaskEdit, nameOf: (id: string) => string): ChecklistRow[] {
    const edits = (input.update ?? []).map((change) => {
        const text = `${nameOf(change.subtaskId)}: ${changeText(change)}`;
        return { label: text, text, remove: false };
    });
    return [
        ...(input.add ?? []).map((title) => ({ label: `Add ${title}`, text: `+ ${title}`, remove: false })),
        ...edits,
        ...(input.remove ?? []).map((step) => ({ label: `Remove ${step.title}`, text: step.title, remove: true })),
        ...(input.order?.length ? [{ label: "Reorder steps", text: `New order: ${input.order.map(nameOf).join(" → ")}`, remove: false }] : []),
    ];
}

const onlyAdds = (input: SubtaskEdit) => !input.update?.length && !input.remove?.length && !input.order?.length;

/** A card that only removes steps reads as a delete. */
const REMOVE_LOOK = { tone: "danger" as const, primaryGlyph: Trash2, primaryVariant: "cardDanger" as const, declineLabel: "Keep them" };

function primaryLabelFor(onlyAdds: boolean, onlyRemoves: boolean, kept: number) {
    if (onlyAdds) return `Add ${kept === 1 ? "step" : `${kept} steps`}`;
    return onlyRemoves ? `Remove ${kept}` : "Update checklist";
}

/**
 * Card for `edit_subtasks`: one checklist diff for a task. New steps are marked +,
 * ticks and renames say what changes, removed steps are struck through. Every row
 * can be unticked before approving.
 */
export function SubtaskEditCard({ ctx }: { ctx: ToolRenderContext<"edit_subtasks"> }) {
    const input: SubtaskEdit = ctx.part?.input ?? {};
    const taskId = input.taskId ?? "";
    const lookupTitle = useTaskTitleLookup();
    const { data: current } = useSubtasks(input.update?.length || input.order?.length ? taskId : "");
    const { off, onToggle, removed } = useUnticked(ctx);
    const parent = taskId ? lookupTitle(taskId) : "this task";
    const nameOf = (id: string) => current?.find((s) => s.id === id)?.title ?? "a step";

    const rows = checklistRows(input, nameOf);
    const onlyRemoves = rows.length > 0 && rows.every((row) => row.remove);
    const primaryLabel = primaryLabelFor(onlyAdds(input), onlyRemoves, rows.length - off.size);

    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHECKLIST"
            eyebrowGlyph={ListChecks}
            ariaLabel={`Checklist changes for ${parent}`}
            primaryLabel={primaryLabel}
            {...(onlyRemoves ? REMOVE_LOOK : { primaryGlyph: Check })}
            removed={removed(rows.map((row) => row.label))}
            doneText={`Updated the checklist on “${parent}”.`}
        >
            <p className="text-xs text-twilight-text-soft">
                On “<span className="text-twilight-text">{parent}</span>”
            </p>
            <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                {rows.map((row, i) => (
                    <TickRow key={i} on={!off.has(i)} onToggle={onToggle(i)} label={row.label}>
                        <span className={row.remove ? "line-through" : undefined}>{row.text}</span>
                    </TickRow>
                ))}
            </div>
        </ApprovalCard>
    );
}
