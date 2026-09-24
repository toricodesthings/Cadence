import React from "react";
import { getToolName } from "ai";
import { ToolActivityChip, WriteConfirmChip } from "./ToolActivityChip";
import { ProposalCard } from "./widgets/ProposalCard";
import { TaskBatchCard } from "./widgets/TaskBatchCard";
import { UpdateTasksCard } from "./widgets/UpdateTasksCard";
import { SubtaskEditCard } from "./widgets/SubtaskEditCard";
import { DeleteTasksCard, RescheduleCard, SetStateCard } from "./widgets/TaskListCards";
import { CreateProjectCard, CreateTagCard, InboxStructureCard, LogHabitCard } from "./widgets/SmallCards";
import type { ToolRenderContext } from "./widgets/ApprovalCard";
import { Sparkles } from "lucide-react";

/**
 * Tool-part registry (ai_frontend.md §6.1) — the SINGLE coupling point to backend
 * tool names; `tests/unit/ai-tools.test.ts` in the backend checks they match.
 *
 * Three classes, all executed on the server:
 *  - read  → subtle activity chip (no card).
 *  - write → an approval card: it waits for a tap when the server asks for one,
 *    otherwise it arrives done and shows settled.
 *  - capture → never waits (capture_to_inbox); quiet confirm chip.
 */

export type ToolClass = "read" | "write" | "capture";

interface ToolDescriptor {
    class: ToolClass;
    /** Read/capture chip copy (design §9.2). */
    label: string;
    /** Write card renderer. */
    render?: (ctx: ToolRenderContext) => React.ReactNode;
}

const TOOL_REGISTRY: Record<string, ToolDescriptor> = {
    // ── read → activity chip ──────────────────────────────────────────────
    get_tasks: { class: "read", label: "Checked your tasks" },
    get_task_detail: { class: "read", label: "Checked your tasks" },
    get_projects: { class: "read", label: "Checked your lists" },
    get_tags: { class: "read", label: "Checked your tags" },
    get_habits: { class: "read", label: "Looked at your routines" },
    get_habit_status_today: { class: "read", label: "Looked at your routines" },
    get_inbox_items: { class: "read", label: "Looked through Capture" },
    get_user_metrics: { class: "read", label: "Took a look around" },
    get_schedule_window: { class: "read", label: "Scanned your schedule" },
    get_cadence_help: { class: "read", label: "Checked the Cadence guide" },

    // ── write → approval cards ────────────────────────────────────────────
    create_tasks: { class: "write", label: "Added tasks", render: (ctx) => <TaskBatchCard ctx={ctx} /> },
    update_tasks: { class: "write", label: "Changed tasks", render: (ctx) => <UpdateTasksCard ctx={ctx} /> },
    edit_subtasks: { class: "write", label: "Changed a checklist", render: (ctx) => <SubtaskEditCard ctx={ctx} /> },
    set_task_state: { class: "write", label: "Moved tasks", render: (ctx) => <SetStateCard ctx={ctx} /> },
    delete_tasks: { class: "write", label: "Deleted tasks", render: (ctx) => <DeleteTasksCard ctx={ctx} /> },
    reschedule_tasks: { class: "write", label: "Rescheduled tasks", render: (ctx) => <RescheduleCard ctx={ctx} /> },
    structure_inbox_item: { class: "write", label: "Structured a capture", render: (ctx) => <InboxStructureCard ctx={ctx} /> },
    create_project: { class: "write", label: "Made a list", render: (ctx) => <CreateProjectCard ctx={ctx} /> },
    create_tag: { class: "write", label: "Made a tag", render: (ctx) => <CreateTagCard ctx={ctx} /> },
    log_habit: { class: "write", label: "Logged a routine", render: (ctx) => <LogHabitCard ctx={ctx} /> },

    // ── capture → quiet confirmation chip ─────────────────────────────────
    capture_to_inbox: { class: "capture", label: "Saved to your inbox" },
};

/**
 * Proposals from before 0.19 (the client wrote them, then saved a decision). Old
 * threads still hold them, so they render settled and read-only: applied or not.
 */
function RetiredProposal({ applied }: { applied: boolean }) {
    const label = "Earlier suggestion";
    return (
        <ProposalCard
            state="output-available"
            eyebrow={label}
            eyebrowGlyph={Sparkles}
            ariaLabel={label}
            primaryLabel=""
            resolvedCommitted={applied}
            resolvedText={`${label} · ${applied ? "applied" : "not applied"}`}
        >
            {null}
        </ProposalCard>
    );
}

/** Resolve the descriptor for a tool name, or undefined for unknown tools. */
export function getToolDescriptor(toolName: string): ToolDescriptor | undefined {
    return TOOL_REGISTRY[toolName];
}

/**
 * Dispatcher for a single tool part. Write cards and capture render their own UI;
 * read parts are collected and rendered as one grouped chip by the panel, so
 * here a read part renders nothing (returns null) — see `collectReadLabels`.
 * Unknown tools degrade to a neutral "Working…" chip (forward-compatible).
 */
export function ToolPart({
    part,
    answer,
    stale,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part: any;
    /** Answers the part's approval request; absent while a turn runs or on an older reply. */
    answer?: ToolRenderContext["answer"];
    /** The part sits on an older reply. */
    stale?: boolean;
}) {
    const toolName = safeToolName(part);
    const descriptor = toolName ? TOOL_REGISTRY[toolName] : undefined;
    if (toolName?.startsWith("propose_")) return <RetiredProposal applied={part?.output?.decision === "commit"} />;

    if (!descriptor) {
        // Unknown / future tool → neutral chip.
        return <ToolActivityChip
                calls={[{ label: "Working…", tool: toolName, input: part?.input, pending: part?.state !== "output-available" }]}
                pending={part?.state !== "output-available"}
            />;
    }

    if (descriptor.class === "read") {
        // Read chips are grouped per-turn by the panel; nothing to render solo.
        return null;
    }

    if (descriptor.class === "capture") {
        return <WriteConfirmChip label={descriptor.label} />;
    }

    return <>{descriptor.render?.({ part, toolName: toolName!, answer, stale })}</>;
}

/** Safely extract a tool name from a part, tolerating non-tool parts. */
export function safeToolName(part: { type?: string }): string | undefined {
    if (typeof part?.type !== "string" || !part.type.startsWith("tool-")) return undefined;
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return getToolName(part as any);
    } catch {
        // Fallback: strip the "tool-" prefix.
        return part.type.slice("tool-".length);
    }
}

/** True when a part is a read-class tool part (used for grouped chip collection). */
export function isReadToolPart(part: { type?: string }): boolean {
    const name = safeToolName(part);
    return !!name && TOOL_REGISTRY[name]?.class === "read";
}
