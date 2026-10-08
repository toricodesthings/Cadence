import type { MutationOp } from "./offline-wal";
import { formatShortDate, formatWallTime } from "../utils/date-format";

const quote = (text: string | undefined | null) => (text ? `“${text.length > 60 ? `${text.slice(0, 57)}…` : text}”` : "");
const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/**
 * A queued change in plain words ("Complete “Pay rent”"), for the sync review.
 * `titleOf` looks up a task or routine name the cache still holds.
 */
export function describeChange(op: MutationOp, titleOf: (id: string) => string | undefined): string {
    const task = (id: string) => quote(titleOf(id)) || "a task";
    switch (op.type) {
        case "create_task": return `Add ${quote(op.payload.title)}`;
        case "update_task": {
            const { state, scheduledStart, dueDate } = op.payload;
            if (state === "COMPLETE") return `Complete ${task(op.id)}`;
            if (state === "ARCHIVED") return `Move ${task(op.id)} to Trash`;
            if (state === "ACTIVE") return `Restore ${task(op.id)}`;
            if (scheduledStart !== undefined || dueDate !== undefined) return `Reschedule ${task(op.id)}`;
            return `Edit ${task(op.id)}`;
        }
        case "delete_task": return `Delete ${task(op.id)}`;
        case "reorder_task": return `Move ${task(op.id)}`;
        case "duplicate_task": return `Copy ${task(op.id)}`;
        case "batch_state": return `Update ${plural(op.payload.taskIds.length, "task")}`;
        case "batch_reschedule": return `Reschedule ${plural(op.payload.taskIds.length, "task")}`;
        case "batch_delete": return `Delete ${plural(op.payload.taskIds.length, "task")}`;
        case "create_inbox": return `Capture ${quote(op.payload.rawText)}`;
        case "update_inbox": return "Edit a capture";
        case "delete_inbox": return "Delete a capture";
        case "process_inbox_to_task": return `Make ${quote(op.payload.title || op.payload.rawText)} a task`;
        case "unprocess_inbox": return "Move a task back to Capture";
        case "create_inbox_section": return `Add section ${quote(op.payload.name)}`;
        case "update_inbox_section": return "Edit a Capture section";
        case "delete_inbox_section": return "Delete a Capture section";
        case "create_habit": return `Add routine ${quote(String(op.payload.title ?? ""))}`;
        case "update_habit": return `Edit ${quote(titleOf(op.id)) || "a routine"}`;
        case "delete_habit": return `Delete ${quote(titleOf(op.id)) || "a routine"}`;
        case "resolve_habit": return `Log ${quote(titleOf(op.id)) || "a routine"} for ${formatShortDate(op.payload.targetDate)}${op.payload.time ? ` at ${formatWallTime(op.payload.time)}` : ""}`;
        case "upsert_note": return `Edit the note on ${task(op.taskId)}`;
        case "add_task_tag": return `Tag ${task(op.id)}`;
        case "remove_task_tag": return `Untag ${task(op.id)}`;
        case "create_subtask": return `Add step ${quote(op.payload.title)}`;
        case "update_subtask": return op.payload.isComplete === undefined ? "Rename a step" : "Tick a step";
        case "delete_subtask": return "Delete a step";
        case "reorder_subtask": return "Reorder steps";
        case "create_project": return `Add list ${quote(op.payload.name)}`;
        case "update_project": return "Edit a list";
        case "create_tag": return `Add tag ${quote(op.payload.name)}`;
        case "update_tag": return "Edit a tag";
        case "create_section": return `Add section ${quote(op.payload.name)}`;
        case "update_section": return "Edit a section";
        default: {
            const _exhaustive: never = op;
            return String((_exhaustive as MutationOp).type);
        }
    }
}
