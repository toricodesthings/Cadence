/**
 * Which tool calls wait for the user's tap, decided on the server (AI SDK
 * `toolApproval`). Reads and capture never wait. Ask waits on every other tool,
 * so a new write tool waits by default. Auto waits only on what `needsTap` flags.
 * Full never waits.
 */
import type { ApprovalMode } from "@cadence/contracts/ai";

/** Auto applies changes to at most this many tasks without a tap. */
export const AUTO_TASK_LIMIT = 5;

/** Reads, and capture (additive, discardable), run without approval in every mode. */
function isFree(toolName: string) {
    return toolName.startsWith("get_") || toolName === "capture_to_inbox";
}

/**
 * True when Auto should still wait: permanent deletes (tasks, events, sections), removing subtasks, a whole
 * note rewrite (it can remove text), and anything touching more than 5 tasks.
 */
export function needsTap(toolName: string, input: unknown): boolean {
    const args = (input ?? {}) as { taskIds?: unknown[]; tasks?: unknown[]; remove?: unknown[]; patch?: { note?: unknown } };
    if (toolName.startsWith("delete_")) return true;
    if (toolName === "edit_subtasks" && args.remove?.length) return true;
    if (toolName === "update_tasks" && args.patch?.note !== undefined) return true;
    return (args.taskIds?.length ?? args.tasks?.length ?? 0) > AUTO_TASK_LIMIT;
}

/** The agent's `toolApproval` for one turn's approval mode. */
export function approvalFor(mode: ApprovalMode) {
    return ({ toolCall }: { toolCall: { toolName: string; input: unknown } }) => {
        if (mode === "full" || isFree(toolCall.toolName)) return undefined;
        if (mode === "ask" || needsTap(toolCall.toolName, toolCall.input)) return "user-approval" as const;
        return undefined;
    };
}
