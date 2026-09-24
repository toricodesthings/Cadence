import { ListChecks, Check, Trash2 } from "lucide-react";
import { ApprovalCard, TickRow, useUnticked, type ToolRenderContext } from "./ApprovalCard";
import { useTaskTitleLookup } from "./card-lookups";
import { useSubtasks } from "../../../hooks/tasks/use-subtasks";

interface SubtaskEdit {
    taskId?: string;
    add?: string[];
    update?: { subtaskId: string; title?: string; isComplete?: boolean }[];
    remove?: { subtaskId: string; title: string }[];
}

/**
 * Card for `edit_subtasks`: one checklist diff for a task. New steps are marked +,
 * ticks and renames say what changes, removed steps are struck through. Every row
 * can be unticked before approving.
 */
export function SubtaskEditCard({ ctx }: { ctx: ToolRenderContext }) {
    const input: SubtaskEdit = ctx.part?.input ?? {};
    const taskId = input.taskId ?? "";
    const lookupTitle = useTaskTitleLookup();
    const { data: current } = useSubtasks(input.update?.length ? taskId : "");
    const { off, onToggle, removed } = useUnticked(ctx);
    const parent = taskId ? lookupTitle(taskId) : "this task";
    const nameOf = (id: string) => current?.find((s) => s.id === id)?.title ?? "a step";

    const rows = [
        ...(input.add ?? []).map((title) => ({ label: `Add ${title}`, text: `+ ${title}`, remove: false })),
        ...(input.update ?? []).map((change) => {
            const name = nameOf(change.subtaskId);
            const what = [
                change.isComplete === true ? "tick off" : change.isComplete === false ? "untick" : null,
                change.title !== undefined ? `rename to “${change.title}”` : null,
            ].filter(Boolean).join(", ");
            return { label: `${name}: ${what}`, text: `${name}: ${what}`, remove: false };
        }),
        ...(input.remove ?? []).map((step) => ({ label: `Remove ${step.title}`, text: step.title, remove: true })),
    ];
    const onlyRemoves = rows.length > 0 && rows.every((row) => row.remove);
    const onlyAdds = !input.update?.length && !input.remove?.length;
    const kept = rows.length - off.size;

    return (
        <ApprovalCard
            ctx={ctx}
            tone={onlyRemoves ? "danger" : undefined}
            eyebrow="CHECKLIST"
            eyebrowGlyph={ListChecks}
            ariaLabel={`Checklist changes for ${parent}`}
            primaryLabel={onlyAdds ? `Add ${kept === 1 ? "step" : `${kept} steps`}` : onlyRemoves ? `Remove ${kept}` : "Update checklist"}
            primaryGlyph={onlyRemoves ? Trash2 : Check}
            {...(onlyRemoves && { primaryVariant: "cardDanger" as const, declineLabel: "Keep them" })}
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
