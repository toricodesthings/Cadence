import React from "react";
import { getToolName } from "ai";
import { ToolActivityChip, WriteConfirmChip } from "./ToolActivityChip";
import { TaskProposalCard } from "./widgets/TaskProposalCard";
import { DangerConfirmCard } from "./widgets/DangerConfirmCard";
import { BatchRescheduleCard } from "./widgets/BatchRescheduleCard";
import { CompleteTasksCard } from "./widgets/CompleteTasksCard";
import { CreateProjectCard } from "./widgets/CreateProjectCard";
import { CreateTagCard } from "./widgets/CreateTagCard";
import { LogHabitCard } from "./widgets/LogHabitCard";
import { InboxStructureCard } from "./widgets/InboxStructureCard";
import { InboxClusterCard } from "./widgets/InboxClusterCard";
import { SuggestionActionCard } from "./widgets/SuggestionActionCard";
import { partRenderState, type ToolRenderContext } from "./widgets/use-proposal-resolver";

/**
 * Tool-part registry (ai_frontend.md §6.1) — the SINGLE coupling point to backend
 * tool names. When the backend adds a tool (docs/ai_upgrade/05), add it here.
 *
 * Three classes:
 *  - read  → server-side execute; subtle activity chip (no card).
 *  - proposal → HITL card; confirm routes through an existing REST hook, then
 *    `addToolResult` reports the outcome to the model (the REST call did the write).
 *  - write → already executed server-side (capture_to_inbox); quiet confirm chip.
 */

export type ToolClass = "read" | "proposal" | "write";

interface ToolDescriptor {
    class: ToolClass;
    /** Read/write chip copy (design §9.2). */
    label: string;
    /** Proposal/write renderer. */
    render?: (ctx: ToolRenderContext, state: ReturnType<typeof partRenderState>) => React.ReactNode;
}

export const TOOL_REGISTRY: Record<string, ToolDescriptor> = {
    // ── read → activity chip ──────────────────────────────────────────────
    get_tasks: { class: "read", label: "Checked your tasks" },
    get_task_detail: { class: "read", label: "Checked your tasks" },
    search_tasks: { class: "read", label: "Checked your tasks" },
    get_projects: { class: "read", label: "Checked your projects" },
    get_sections: { class: "read", label: "Checked your projects" },
    get_tags: { class: "read", label: "Checked your projects" },
    get_habits: { class: "read", label: "Looked at your habits" },
    get_habit_status_today: { class: "read", label: "Looked at your habits" },
    get_inbox_items: { class: "read", label: "Looked through your inbox" },
    get_suggestions: { class: "read", label: "Took a look around" },
    get_user_metrics: { class: "read", label: "Took a look around" },
    get_schedule_window: { class: "read", label: "Scanned your schedule" },

    // ── proposal → interactive cards ──────────────────────────────────────
    propose_create_task: {
        class: "proposal",
        label: "Suggested a task",
        render: (ctx, state) => <TaskProposalCard ctx={ctx} state={state} mode="create" />,
    },
    propose_update_task: {
        class: "proposal",
        label: "Suggested a change",
        render: (ctx, state) => <TaskProposalCard ctx={ctx} state={state} mode="update" />,
    },
    propose_batch_reschedule: {
        class: "proposal",
        label: "Proposed a reschedule",
        render: (ctx, state) => <BatchRescheduleCard ctx={ctx} state={state} />,
    },
    propose_delete_task: {
        class: "proposal",
        label: "Asked to delete a task",
        render: (ctx, state) => <DangerConfirmCard ctx={ctx} state={state} />,
    },
    propose_complete_tasks: {
        class: "proposal",
        label: "Proposed marking done",
        render: (ctx, state) => <CompleteTasksCard ctx={ctx} state={state} />,
    },
    propose_create_project: {
        class: "proposal",
        label: "Suggested a project",
        render: (ctx, state) => <CreateProjectCard ctx={ctx} state={state} />,
    },
    propose_create_tag: {
        class: "proposal",
        label: "Suggested a tag",
        render: (ctx, state) => <CreateTagCard ctx={ctx} state={state} />,
    },
    propose_log_habit: {
        class: "proposal",
        label: "Proposed a habit log",
        render: (ctx, state) => <LogHabitCard ctx={ctx} state={state} />,
    },
    propose_structure_inbox_item: {
        class: "proposal",
        label: "Proposed structuring a capture",
        render: (ctx, state) => <InboxStructureCard ctx={ctx} state={state} />,
    },
    propose_cluster_inbox: {
        class: "proposal",
        label: "Proposed grouping captures",
        render: (ctx, state) => <InboxClusterCard ctx={ctx} state={state} />,
    },
    propose_suggestion_action: {
        class: "proposal",
        label: "Proposed a suggestion action",
        render: (ctx, state) => <SuggestionActionCard ctx={ctx} state={state} />,
    },

    // ── write → quiet confirmation chip ───────────────────────────────────
    capture_to_inbox: { class: "write", label: "Saved to your inbox" },
};

/** Resolve the descriptor for a tool name, or undefined for unknown tools. */
export function getToolDescriptor(toolName: string): ToolDescriptor | undefined {
    return TOOL_REGISTRY[toolName];
}

/**
 * Dispatcher for a single tool part. Proposals + writes render their own UI;
 * read parts are collected and rendered as one grouped chip by the panel, so
 * here a read part renders nothing (returns null) — see `collectReadLabels`.
 * Unknown tools degrade to a neutral "Working…" chip (forward-compatible).
 */
export function ToolPart({
    part,
    addToolResult,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part: any;
    addToolResult: ToolRenderContext["addToolResult"];
}) {
    const toolName = safeToolName(part);
    const descriptor = toolName ? TOOL_REGISTRY[toolName] : undefined;

    if (!descriptor) {
        // Unknown / future tool → neutral chip.
        return <ToolActivityChip labels={["Working…"]} pending={part?.state !== "output-available"} />;
    }

    if (descriptor.class === "read") {
        // Read chips are grouped per-turn by the panel; nothing to render solo.
        return null;
    }

    if (descriptor.class === "write") {
        return <WriteConfirmChip label={descriptor.label} />;
    }

    // proposal
    const state = partRenderState(part);
    const ctx: ToolRenderContext = { part, addToolResult, toolName: toolName! };
    return <>{descriptor.render?.(ctx, state)}</>;
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
