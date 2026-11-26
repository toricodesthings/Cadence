import type { ApprovalMode } from "@cadence/contracts/ai";
import { TOOL_CATALOG, type ToolName } from "@cadence/contracts/ai-tools";

export const AUTO_TASK_LIMIT = 5;

function isFree(toolName: string) {
    return (
        TOOL_CATALOG[toolName as ToolName]?.kind === "read" ||
        toolName === "capture_to_inbox" ||
        toolName === "ask_user" ||
        toolName === "remember"
    );
}

export function needsTap(toolName: string, input: unknown): boolean {
    const args = (input ?? {}) as {
        taskIds?: unknown[];
        tasks?: unknown[];
        items?: unknown[];
        remove?: unknown[];
        patch?: { note?: unknown };
    };
    if (toolName.startsWith("delete_")) return true;
    if (toolName === "edit_subtasks" && args.remove?.length) return true;
    if (toolName === "update_tasks" && args.patch?.note !== undefined) return true;
    return (args.taskIds?.length ?? args.tasks?.length ?? args.items?.length ?? 0) > AUTO_TASK_LIMIT;
}

export function approvalFor(
    mode: ApprovalMode,
    { hasAttachments = () => false }: { hasAttachments?: () => boolean } = {},
) {
    return ({ toolCall }: { toolCall: { toolName: string; input: unknown } }) => {
        if (isFree(toolCall.toolName)) return undefined;
        if (toolCall.toolName === "update_settings") return "user-approval" as const;
        if (mode === "full" && !hasAttachments()) return undefined;
        if (mode === "ask" || needsTap(toolCall.toolName, toolCall.input)) return "user-approval" as const;
        return undefined;
    };
}
