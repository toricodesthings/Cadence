import { useMemo } from "react";
import { useInbox } from "./use-inbox";
import { useTasks } from "../tasks/use-tasks";
import { isPassiveTimetableTask } from "../../lib/utils/task/task-scheduling";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { Task } from "@cadence/contracts/task";

export function captureFeed(items: InboxItem[], tasks: Task[], now = Date.now()) {
    const active = items.filter((i) => i.captureStatus === "clarifying");
    const cutoff = now - 14 * 24 * 60 * 60 * 1000;
    const thoughts = active.filter((i) => new Date(i.createdAt).getTime() >= cutoff);
    const older = active.filter((i) => new Date(i.createdAt).getTime() < cutoff);
    const noDay = tasks.filter(
        (t) => t.state === "ACTIVE" && !t.projectId && !t.dueDate && !t.scheduledStart && !isPassiveTimetableTask(t),
    );
    return { thoughts, older, tasks: noDay, count: thoughts.length + noDay.length };
}

/** The single definition of Capture, shared by its feed and navigation badges. */
export function useCaptureFeed() {
    const inbox = useInbox();
    const notes = useInbox("kept");
    const tasks = useTasks({ state: "ACTIVE", hasNoProject: true, hasNoDate: true });
    const feed = useMemo(() => captureFeed(inbox.data ?? [], tasks.data ?? []), [inbox.data, tasks.data]);
    return {
        ...feed,
        inboxItems: inbox.data ?? [],
        notes: (notes.data ?? []).filter((i) => i.captureStatus === "kept"),
        isLoading: inbox.isLoading || tasks.isLoading,
    };
}
