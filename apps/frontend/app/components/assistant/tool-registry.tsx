import React from "react";
import { isAssistantToolPart, type AssistantToolPart } from "../../lib/ai/messages";
import type { UIMessage } from "ai";
import { ToolActivityChip, WriteConfirmChip, type ToolCall } from "./ToolActivityChip";
import { ProposalCard } from "./widgets/ProposalCard";
import { TaskBatchCard } from "./widgets/TaskBatchCard";
import { UpdateTasksCard } from "./widgets/UpdateTasksCard";
import { SubtaskEditCard } from "./widgets/SubtaskEditCard";
import {
    DeleteTasksCard,
    DuplicateTasksCard,
    ReorderTasksCard,
    RescheduleCard,
    SetStateCard,
} from "./widgets/TaskListCards";
import {
    CreateEventCard,
    CreateProjectCard,
    CreateSectionsCard,
    CreateTagCard,
    DeleteEventCard,
    DeleteHabitCard,
    DeleteSectionCard,
    CreateHabitCard,
    LogHabitCard,
    UpdateEventCard,
    UpdateHabitCard,
    UpdateSectionCard,
} from "./widgets/SmallCards";
import { DeleteCapturesCard, UpdateCapturesCard } from "./widgets/CaptureCards";
import {
    CreateFocusViewCard,
    DeleteFocusViewCard,
    DeleteProjectCard,
    DeleteTagCard,
    UpdateFocusViewCard,
    UpdateProjectCard,
    UpdateTagCard,
} from "./widgets/OrganizeCards";
import { outcomeOf, type RetiredRenderContext, type ToolRenderContext } from "./widgets/ApprovalCard";
import { SettingsCard } from "./widgets/SettingsCard";
import { AskCard } from "./widgets/AskCard";
import { RememberReceipt } from "./widgets/RememberReceipt";
import { FindTimeCard, FitDayCard } from "./widgets/PlanCards";
import { Sparkles } from "lucide-react";
import { TOOL_CATALOG, isToolName, type ToolKind, type ToolName } from "@cadence/contracts/ai-tools";

interface ToolDescriptor {
    class: ToolKind;
    label: string;
    render?: (ctx: ToolRenderContext<never>) => React.ReactNode;
}

const card =
    <N extends ToolName>(Card: React.ComponentType<{ ctx: ToolRenderContext<N> }>) =>
    (ctx: ToolRenderContext<N>) => <Card ctx={ctx} />;

const TOOL_REGISTRY: { [N in ToolName]: { label: string; render?: (ctx: ToolRenderContext<N>) => React.ReactNode } } = {
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
    get_settings: { label: "Checked your settings" },
    find_time: { label: "Looked for a gap", render: card(FindTimeCard) },
    fit_day: { label: "Laid out your day", render: card(FitDayCard) },
    recall: { label: "Thought back to what you told me" },
    search_past_chats: { label: "Looked through your past chats" },

    create_tasks: { label: "Added tasks", render: card(TaskBatchCard) },
    duplicate_tasks: { label: "Copied tasks", render: card(DuplicateTasksCard) },
    update_tasks: { label: "Changed tasks", render: card(UpdateTasksCard) },
    reorder_tasks: { label: "Reordered tasks", render: card(ReorderTasksCard) },
    edit_subtasks: { label: "Changed a checklist", render: card(SubtaskEditCard) },
    set_task_state: { label: "Moved tasks", render: card(SetStateCard) },
    delete_tasks: { label: "Deleted tasks", render: card(DeleteTasksCard) },
    reschedule_tasks: { label: "Rescheduled tasks", render: card(RescheduleCard) },
    update_captures: { label: "Changed captures", render: card(UpdateCapturesCard) },
    delete_captures: { label: "Deleted captures", render: card(DeleteCapturesCard) },
    create_project: { label: "Made a list", render: card(CreateProjectCard) },
    update_project: { label: "Changed a list", render: card(UpdateProjectCard) },
    delete_project: { label: "Deleted a list", render: card(DeleteProjectCard) },
    create_sections: { label: "Added sections", render: card(CreateSectionsCard) },
    update_section: { label: "Changed a section", render: card(UpdateSectionCard) },
    delete_section: { label: "Deleted a section", render: card(DeleteSectionCard) },
    create_tag: { label: "Made a tag", render: card(CreateTagCard) },
    update_tag: { label: "Changed a tag", render: card(UpdateTagCard) },
    delete_tag: { label: "Deleted a tag", render: card(DeleteTagCard) },
    log_habit: { label: "Logged a routine", render: card(LogHabitCard) },
    create_habit: { label: "Added a routine", render: card(CreateHabitCard) },
    update_habit: { label: "Changed a routine", render: card(UpdateHabitCard) },
    delete_habit: { label: "Deleted a routine", render: card(DeleteHabitCard) },
    save_event: {
        label: "Saved an event",
        render: (ctx) => (ctx.part?.input?.eventId ? <UpdateEventCard ctx={ctx} /> : <CreateEventCard ctx={ctx} />),
    },
    delete_event: { label: "Deleted an event", render: card(DeleteEventCard) },
    save_focus_view: {
        label: "Saved a focus view",
        render: (ctx) =>
            ctx.part?.input?.focusViewId ? <UpdateFocusViewCard ctx={ctx} /> : <CreateFocusViewCard ctx={ctx} />,
    },
    delete_focus_view: { label: "Deleted a focus view", render: card(DeleteFocusViewCard) },

    update_settings: { label: "Changed settings", render: card(SettingsCard) },

    remember: { label: "Remembered", render: card(RememberReceipt) },

    capture_to_inbox: { label: "Saved to your inbox" },

    ask_user: { label: "Asked you", render: card(AskCard) },
};

const RETIRED_CAPTURE_WRITES = new Set(["structure_inbox_item", "structure_captures"]);
const RETIRED_WRITES: Record<string, (ctx: RetiredRenderContext) => React.ReactNode> = {
    create_event: (ctx) => <CreateEventCard ctx={ctx} />,
    update_event: (ctx) => <UpdateEventCard ctx={ctx} />,
    create_focus_view: (ctx) => <CreateFocusViewCard ctx={ctx} />,
    update_focus_view: (ctx) => <UpdateFocusViewCard ctx={ctx} />,
};

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

export function getToolDescriptor(toolName: string | undefined): ToolDescriptor | undefined {
    return toolName && isToolName(toolName)
        ? { class: TOOL_CATALOG[toolName].kind, ...TOOL_REGISTRY[toolName] }
        : undefined;
}

export function ToolPart({
    part,
    answer,
    stale,
    reply,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part: any;
    answer?: ToolRenderContext["answer"];
    stale?: boolean;
    reply?: ToolRenderContext["reply"];
}) {
    const toolName = safeToolName(part);
    const descriptor = getToolDescriptor(toolName);
    if (toolName?.startsWith("propose_")) return <RetiredProposal applied={part?.output?.decision === "commit"} />;
    if (toolName && RETIRED_CAPTURE_WRITES.has(toolName))
        return <RetiredProposal applied={outcomeOf(part, true) === "done"} />;
    const retired = toolName ? RETIRED_WRITES[toolName] : undefined;
    if (retired) return <>{retired({ part, toolName: toolName!, answer, stale })}</>;

    if (!descriptor) {
        return (
            <ToolActivityChip
                calls={[
                    {
                        label: "Working…",
                        tool: toolName,
                        input: part?.input,
                        pending: isInFlight(part),
                        failed: isFailed(part),
                    },
                ]}
                pending={isInFlight(part)}
            />
        );
    }

    if (descriptor.class === "read" && !descriptor.render) {
        return null;
    }

    if (descriptor.class === "capture") {
        return <WriteConfirmChip label={descriptor.label} />;
    }

    return <>{descriptor.render?.({ part, toolName: toolName!, answer, stale, reply })}</>;
}

export function isInFlight(part: { state?: string } | undefined): boolean {
    return part?.state === "input-streaming" || part?.state === "input-available";
}

export function isFailed(part: { state?: string; output?: unknown } | undefined): boolean {
    const output = part?.output;
    return (
        part?.state === "output-error" ||
        (part?.state === "output-available" &&
            !!output &&
            typeof output === "object" &&
            "ok" in output &&
            output.ok === false)
    );
}

export function safeToolName(part: { type?: string }): string | undefined {
    if (typeof part?.type !== "string" || !part.type.startsWith("tool-")) return undefined;
    return part.type.slice("tool-".length);
}

export function isReadToolPart(part: { type?: string }): boolean {
    const name = safeToolName(part);
    return !!name && isToolName(name) && TOOL_CATALOG[name].kind === "read";
}

export type MessageSegment =
    | { kind: "text"; text: string }
    | { kind: "reads"; calls: ToolCall[]; pending: boolean }
    | { kind: "card"; part: AssistantToolPart };

export function buildSegments(parts: UIMessage["parts"]): MessageSegment[] {
    const segments: MessageSegment[] = [];
    for (const part of parts) {
        const last = segments.at(-1);
        if (part.type === "text") {
            if (!part.text) continue;
            if (last?.kind === "text") last.text += `\n\n${part.text}`;
            else segments.push({ kind: "text", text: part.text });
        } else if (isAssistantToolPart(part)) {
            if (!isReadToolPart(part)) {
                segments.push({ kind: "card", part });
                continue;
            }
            const name = safeToolName(part);
            if (name && getToolDescriptor(name)?.render && part.state === "output-available") {
                segments.push({ kind: "card", part });
                continue;
            }
            const label = (name && getToolDescriptor(name)?.label) || "Looked something up";
            const pending = isInFlight(part);
            const call: ToolCall = { label, tool: name, input: part.input, pending, failed: isFailed(part) };
            if (last?.kind === "reads") {
                last.calls.push(call);
                last.pending ||= pending;
            } else {
                segments.push({ kind: "reads", calls: [call], pending });
            }
        }
    }
    return segments;
}
