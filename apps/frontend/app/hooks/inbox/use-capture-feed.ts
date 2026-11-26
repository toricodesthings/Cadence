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

export function useCaptureFeed() {
    const inbox = useInbox();
    const notes = useInbox("kept");
    const tasks = useTasks({ state: "ACTIVE", hasNoProject: true, hasNoDate: true });
    const feed = useMemo(() => captureFeed(inbox.data ?? [], tasks.data ?? []), [inbox.data, tasks.data]);
    const keptNotes = useMemo(() => (notes.data ?? []).filter((i) => i.captureStatus === "kept"), [notes.data]);
    return {
        ...feed,
        inboxItems: inbox.data ?? [],
        notes: keptNotes,
        isEmpty: feed.count === 0 && feed.older.length === 0 && keptNotes.length === 0,
        isLoading: inbox.isLoading || tasks.isLoading,
    };
}
