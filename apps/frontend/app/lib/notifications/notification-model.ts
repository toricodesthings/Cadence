import { dayOf, todayIn } from "@cadence/domain/time";
import { getUserZone } from "../utils/user-zone";

export type { ReminderKind as NotificationKind } from "@cadence/domain/reminders";
import type { ReminderKind as NotificationKind } from "@cadence/domain/reminders";

export type NotificationPriority = "normal" | "high";

export interface AppNotification {
    /** Stable id for dedup: e.g. "task-reminder::{taskId}::{reminderAt}" */
    id: string;
    kind: NotificationKind;
    title: string;
    body: string;
    /** Instant the notification becomes relevant */
    triggerAt: string;
    /** Instant an OS alert is due; null = never alerts the OS */
    alertAt: string | null;
    /** A held OS alert (quiet hours, a pause) still goes out until this instant */
    relevantUntil?: string | null;
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
    const diffMs = now.getTime() - Date.parse(n.triggerAt);
    const diffMin = diffMs / 60_000;

    // "Now" = triggered within the last 15 minutes or in the future
    if (diffMin <= 15) return "now";

    // "Today" = triggered earlier today (the user's day)
    const zone = getUserZone();
    if (dayOf(n.triggerAt, zone) === todayIn(zone, now)) return "today";

    return "earlier";
}

export const GROUP_ORDER: NotificationGroup[] = ["now", "today", "earlier"];
