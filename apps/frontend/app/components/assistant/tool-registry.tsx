import React from "react";
import { getToolName } from "ai";
import { ToolActivityChip, WriteConfirmChip } from "./ToolActivityChip";
import { ProposalCard } from "./widgets/ProposalCard";
import { TaskBatchCard } from "./widgets/TaskBatchCard";
import { UpdateTasksCard } from "./widgets/UpdateTasksCard";
import { SubtaskEditCard } from "./widgets/SubtaskEditCard";
import { DeleteTasksCard, DuplicateTasksCard, ReorderTasksCard, RescheduleCard, SetStateCard } from "./widgets/TaskListCards";
import {
    CreateEventCard, CreateProjectCard, CreateSectionsCard, CreateTagCard, DeleteEventCard, DeleteHabitCard, DeleteSectionCard,
    CreateHabitCard, LogHabitCard, UpdateEventCard, UpdateHabitCard, UpdateSectionCard,
} from "./widgets/SmallCards";
import { DeleteCapturesCard, InboxStructureCard, StructureCapturesCard, UpdateCapturesCard } from "./widgets/CaptureCards";
import {
    CreateFocusViewCard, DeleteFocusViewCard, DeleteProjectCard, DeleteTagCard, UpdateFocusViewCard, UpdateProjectCard, UpdateTagCard,
} from "./widgets/OrganizeCards";
import type { RetiredRenderContext, ToolRenderContext } from "./widgets/ApprovalCard";
import { AskCard } from "./widgets/AskCard";
import { RememberReceipt } from "./widgets/RememberReceipt";
import { Sparkles } from "lucide-react";
import { TOOL_CATALOG, isToolName, type ToolKind, type ToolName } from "@cadence/contracts/ai-tools";

/**
 * Tool-part registry: chip copy and card per tool. Names and classes come from
 * `@cadence/contracts/ai-tools`, so a tool added or removed there fails tsc here.
 *
 * Three classes, all executed on the server:
 *  - read  → subtle activity chip (no card).
 *  - write → an approval card: it waits for a tap when the server asks for one,
 *    otherwise it arrives done and shows settled.
 *  - capture → never waits (capture_to_inbox); quiet confirm chip.
 *  - ask → the assistant's question (ask_user); answered as the user's next message.
 */

interface ToolDescriptor {
    class: ToolKind;
    /** Read/capture chip copy (design §9.2). */
    label: string;
    /** Write card renderer; each takes its own tool's context, the dispatcher passes the part as received. */
    render?: (ctx: ToolRenderContext<never>) => React.ReactNode;
}

const TOOL_REGISTRY: { [N in ToolName]: { label: string; render?: (ctx: ToolRenderContext<N>) => React.ReactNode } } = {
    // ── read → activity chip ──────────────────────────────────────────────
    get_tasks: { label: "Checked your tasks" },
    get_task_detail: { label: "Checked your tasks" },
    get_projects: { label: "Checked your lists" },
    get_tags: { label: "Checked your tags" },
    get_habits: { label: "Looked at your routines" },
    get_habit_status_today: { label: "Looked at your routines" },
    get_habit_history: { label: "Looked back at your routines" },
    get_inbox_items: { label: "Looked through Capture" },
    get_user_metrics: { label: "Took a look around" },
    get_schedule_window: { label: "Scanned your schedule" },
    get_events: { label: "Looked at your events" },
    get_focus_views: { label: "Looked at your focus views" },
    get_cadence_help: { label: "Checked the Cadence guide" },
    recall: { label: "Thought back to what you told me" },
    search_past_chats: { label: "Looked through your past chats" },

    // ── write → approval cards ────────────────────────────────────────────
    create_tasks: { label: "Added tasks", render: (ctx) => <TaskBatchCard ctx={ctx} /> },
    duplicate_tasks: { label: "Copied tasks", render: (ctx) => <DuplicateTasksCard ctx={ctx} /> },
    update_tasks: { label: "Changed tasks", render: (ctx) => <UpdateTasksCard ctx={ctx} /> },
    reorder_tasks: { label: "Reordered tasks", render: (ctx) => <ReorderTasksCard ctx={ctx} /> },
    edit_subtasks: { label: "Changed a checklist", render: (ctx) => <SubtaskEditCard ctx={ctx} /> },
    set_task_state: { label: "Moved tasks", render: (ctx) => <SetStateCard ctx={ctx} /> },
    delete_tasks: { label: "Deleted tasks", render: (ctx) => <DeleteTasksCard ctx={ctx} /> },
    reschedule_tasks: { label: "Rescheduled tasks", render: (ctx) => <RescheduleCard ctx={ctx} /> },
    update_captures: { label: "Changed captures", render: (ctx) => <UpdateCapturesCard ctx={ctx} /> },
    delete_captures: { label: "Deleted captures", render: (ctx) => <DeleteCapturesCard ctx={ctx} /> },
    create_project: { label: "Made a list", render: (ctx) => <CreateProjectCard ctx={ctx} /> },
    update_project: { label: "Changed a list", render: (ctx) => <UpdateProjectCard ctx={ctx} /> },
    delete_project: { label: "Deleted a list", render: (ctx) => <DeleteProjectCard ctx={ctx} /> },
    create_sections: { label: "Added sections", render: (ctx) => <CreateSectionsCard ctx={ctx} /> },
    update_section: { label: "Changed a section", render: (ctx) => <UpdateSectionCard ctx={ctx} /> },
    delete_section: { label: "Deleted a section", render: (ctx) => <DeleteSectionCard ctx={ctx} /> },
    create_tag: { label: "Made a tag", render: (ctx) => <CreateTagCard ctx={ctx} /> },
    update_tag: { label: "Changed a tag", render: (ctx) => <UpdateTagCard ctx={ctx} /> },
    delete_tag: { label: "Deleted a tag", render: (ctx) => <DeleteTagCard ctx={ctx} /> },
    log_habit: { label: "Logged a routine", render: (ctx) => <LogHabitCard ctx={ctx} /> },
    create_habit: { label: "Added a routine", render: (ctx) => <CreateHabitCard ctx={ctx} /> },
    update_habit: { label: "Changed a routine", render: (ctx) => <UpdateHabitCard ctx={ctx} /> },
    delete_habit: { label: "Deleted a routine", render: (ctx) => <DeleteHabitCard ctx={ctx} /> },
    create_event: { label: "Added an event", render: (ctx) => <CreateEventCard ctx={ctx} /> },
    update_event: { label: "Changed an event", render: (ctx) => <UpdateEventCard ctx={ctx} /> },
    delete_event: { label: "Deleted an event", render: (ctx) => <DeleteEventCard ctx={ctx} /> },
    create_focus_view: { label: "Saved a focus view", render: (ctx) => <CreateFocusViewCard ctx={ctx} /> },
    update_focus_view: { label: "Changed a focus view", render: (ctx) => <UpdateFocusViewCard ctx={ctx} /> },
    delete_focus_view: { label: "Deleted a focus view", render: (ctx) => <DeleteFocusViewCard ctx={ctx} /> },

    // ── remember → one-line receipt with Undo, never an approval ───────────
    remember: { label: "Remembered", render: (ctx) => <RememberReceipt ctx={ctx} /> },

    // ── capture → quiet confirmation chip ─────────────────────────────────
    capture_to_inbox: { label: "Saved to your inbox" },

    // ── ask → a question to tap or type an answer to ──────────────────────
    ask_user: { label: "Asked you", render: (ctx) => <AskCard ctx={ctx} /> },
};

/** Writes the server no longer offers, still in older threads: they render with their old card. */
const RETIRED_WRITES: Record<string, (ctx: RetiredRenderContext) => React.ReactNode> = {
    structure_inbox_item: (ctx) => <InboxStructureCard ctx={ctx} />,
    structure_captures: (ctx) => <StructureCapturesCard ctx={ctx} />,
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
export function getToolDescriptor(toolName: string | undefined): ToolDescriptor | undefined {
    return toolName && isToolName(toolName) ? { class: TOOL_CATALOG[toolName].kind, ...TOOL_REGISTRY[toolName] } : undefined;
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
    reply,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part: any;
    /** Answers the part's approval request; absent while a turn runs or on an older reply. */
    answer?: ToolRenderContext["answer"];
    /** The part sits on an older reply. */
    stale?: boolean;
    /** Answers an `ask_user` question as the user's next message. */
    reply?: ToolRenderContext["reply"];
}) {
    const toolName = safeToolName(part);
    const descriptor = getToolDescriptor(toolName);
    if (toolName?.startsWith("propose_")) return <RetiredProposal applied={part?.output?.decision === "commit"} />;
    const retired = toolName ? RETIRED_WRITES[toolName] : undefined;
    if (retired) return <>{retired({ part, toolName: toolName!, answer, stale })}</>;

    if (!descriptor) {
        // Unknown / future tool → neutral chip.
        return <ToolActivityChip
                calls={[{ label: "Working…", tool: toolName, input: part?.input, pending: isInFlight(part), failed: isFailed(part) }]}
                pending={isInFlight(part)}
            />;
    }

    if (descriptor.class === "read") {
        // Read chips are grouped per-turn by the panel; nothing to render solo.
        return null;
    }

    if (descriptor.class === "capture") {
        return <WriteConfirmChip label={descriptor.label} />;
    }

    return <>{descriptor.render?.({ part, toolName: toolName!, answer, stale, reply })}</>;
}

/** Still running: an errored or denied call has settled too, so it must stop spinning. */
export function isInFlight(part: { state?: string } | undefined): boolean {
    return part?.state === "input-streaming" || part?.state === "input-available";
}

/** Ran and failed: thrown or rejected (`output-error`), or a tool's own `{ ok: false }`. */
export function isFailed(part: { state?: string; output?: { ok?: unknown } } | undefined): boolean {
    return part?.state === "output-error" || (part?.state === "output-available" && part.output?.ok === false);
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
    return !!name && isToolName(name) && TOOL_CATALOG[name].kind === "read";
}
