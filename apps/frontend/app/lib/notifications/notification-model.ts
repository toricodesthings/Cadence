import { dayOf, todayIn } from "@cadence/domain/time";
import { getUserZone } from "../utils/user-zone";

export type { ReminderKind as NotificationKind } from "@cadence/domain/reminders";
import type { ReminderKind as NotificationKind } from "@cadence/domain/reminders";

export type NotificationPriority = "normal" | "high";

export interface AppNotification {
    id: string;
    kind: NotificationKind;
    title: string;
    body: string;
    triggerAt: string;
    alertAt: string | null;
    relevantUntil?: string | null;
    entityId: string | null;
    route: string | null;
    priority: NotificationPriority;
    read: boolean;
}

export type NotificationGroup = "now" | "today" | "earlier";

export function groupNotification(n: AppNotification, now: Date): NotificationGroup {
    const diffMs = now.getTime() - Date.parse(n.triggerAt);
    const diffMin = diffMs / 60_000;

    if (diffMin <= 15) return "now";

    const zone = getUserZone();
    if (dayOf(n.triggerAt, zone) === todayIn(zone, now)) return "today";

    return "earlier";
}

export const GROUP_ORDER: NotificationGroup[] = ["now", "today", "earlier"];
