export type NotificationKind =
    | "task-reminder"
    | "task-due"
    | "habit-reminder"
    | "system";

export type NotificationPriority = "normal" | "high";

export interface AppNotification {
    /** Stable id for dedup: e.g. "task-reminder::{taskId}::{reminderAt}" */
    id: string;
    kind: NotificationKind;
    title: string;
    body: string;
    /** ISO timestamp the notification becomes relevant */
    triggerAt: string;
    /** Entity id this notification relates to (task or habit id) */
    entityId: string | null;
    /** Route to navigate to when clicked */
    route: string | null;
    priority: NotificationPriority;
    /** Whether the user has read/dismissed this notification in the current session */
    read: boolean;
}

export type NotificationGroup = "now" | "today" | "earlier";

export function groupNotification(n: AppNotification, now: Date): NotificationGroup {
    const trigger = new Date(n.triggerAt);
    const diffMs = now.getTime() - trigger.getTime();
    const diffMin = diffMs / 60_000;

    // "Now" = triggered within the last 15 minutes or in the future
    if (diffMin <= 15) return "now";

    // "Today" = triggered earlier today
    if (
        trigger.getFullYear() === now.getFullYear() &&
        trigger.getMonth() === now.getMonth() &&
        trigger.getDate() === now.getDate()
    ) {
        return "today";
    }

    return "earlier";
}

export const GROUP_LABELS: Record<NotificationGroup, string> = {
    now: "Now",
    today: "Today",
    earlier: "Earlier",
};

export const GROUP_ORDER: NotificationGroup[] = ["now", "today", "earlier"];
