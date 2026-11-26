/**
 * Which tool calls wait for the user's tap, decided on the server (AI SDK
 * `toolApproval`). Reads and capture never wait. Ask waits on every other tool,
 * so a new write tool waits by default. Auto waits only on what `needsTap` flags.
 * Full waits like Auto while the recent context holds a photo or PDF (text in a file
 * is someone else's words, and could be steering the turn). `update_settings` waits in
 * every mode: a silenced reminder can't be un-missed, and the card is the preview.
 */
import type { ApprovalMode } from "@cadence/contracts/ai";
import { TOOL_CATALOG, type ToolName } from "@cadence/contracts/ai-tools";

/** Auto applies changes to at most this many tasks without a tap. */
export const AUTO_TASK_LIMIT = 5;

/** Reads (every catalog `read`: `get_*`, find_time, fit_day, recall, search_past_chats), capture (additive, discardable), a question to the user and `remember` (it shows its own Undo receipt) run without approval in every mode. */
function isFree(toolName: string) {
    return (
        TOOL_CATALOG[toolName as ToolName]?.kind === "read" ||
        toolName === "capture_to_inbox" ||
        toolName === "ask_user" ||
        toolName === "remember"
    );
}

/**
 * True when Auto should still wait: permanent deletes (any `delete_*`: tasks, lists, tags, captures, routines,
 * events, sections, focus views), removing subtasks, a whole note rewrite (it can remove text), and anything
 * touching more than 5 tasks or captures.
 */
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

/** The agent's `toolApproval` for one turn's approval mode. `hasAttachments` is read at call time: files hydrate after the agent is built. */
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
