import { useMemo, useCallback, useSyncExternalStore, useRef, useEffect } from "react";
import { useTasks } from "./tasks";
import { useAllHabits } from "./habits/use-habits";
import { useSettings } from "./use-settings";
import { deriveNotifications } from "../lib/notifications/reminder-engine";
import type { AppNotification, NotificationGroup } from "../lib/notifications/notification-model";
import { groupNotification, GROUP_ORDER } from "../lib/notifications/notification-model";

// ── Dismissed-ids store (session-scoped, survives re-renders but not tab close) ──
const dismissedIds = new Set<string>();
const readIds = new Set<string>();
let storeVersion = 0;
const listeners = new Set<() => void>();

function emitChange() {
    storeVersion++;
    for (const l of listeners) l();
}

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function getSnapshot() {
    return storeVersion;
}

export interface GroupedNotifications {
    group: NotificationGroup;
    label: string;
    items: AppNotification[];
}

export function useNotificationCenter() {
    const { data: settings } = useSettings();
    const taskReminders = settings?.notifications?.taskReminders ?? true;
    const habitReminders = settings?.notifications?.habitReminders ?? true;
    const dueDateAlerts = settings?.notifications?.dueDateAlerts ?? true;
    const quietHoursEnabled = settings?.notifications?.quietHoursEnabled ?? false;
    const quietHoursStart = settings?.notifications?.quietHoursStart ?? null;
    const quietHoursEnd = settings?.notifications?.quietHoursEnd ?? null;

    // Fetch all active tasks and habits
    const { data: tasks = [] } = useTasks({});
    const { data: habits = [] } = useAllHabits();

    // Track version so we re-derive when read/dismissed changes
    const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    // Use a ref-based "now" that updates every 60s
    const nowRef = useRef(new Date());
    useEffect(() => {
        const id = setInterval(() => {
            nowRef.current = new Date();
            emitChange(); // trigger re-derive
        }, 60_000);
        return () => clearInterval(id);
    }, []);

    const allNotifications = useMemo(() => {
        const raw = deriveNotifications(tasks, habits, nowRef.current);

        // Filter by user notification preferences
        return raw.filter((n) => {
            if (n.kind === "task-reminder" && !taskReminders) return false;
            if (n.kind === "task-due" && !dueDateAlerts) return false;
            if (n.kind === "habit-reminder" && !habitReminders) return false;
            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks, habits, taskReminders, habitReminders, dueDateAlerts, version]);

    const notifications = useMemo(() => {
        return allNotifications
            .filter((n) => !dismissedIds.has(n.id))
            .map((n) => ({ ...n, read: readIds.has(n.id) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allNotifications, version]);

    const grouped = useMemo(() => {
        const now = nowRef.current;
        const groups = new Map<NotificationGroup, AppNotification[]>();
        for (const n of notifications) {
            const g = groupNotification(n, now);
            const list = groups.get(g) ?? [];
            list.push(n);
            groups.set(g, list);
        }
        return GROUP_ORDER
            .filter((g) => groups.has(g))
            .map((g) => ({
                group: g,
                label: g === "now" ? "Now" : g === "today" ? "Today" : "Earlier",
                items: groups.get(g)!,
            })) satisfies GroupedNotifications[];
    }, [notifications]);

    const unreadCount = useMemo(
        () => notifications.filter((n) => !n.read).length,
        [notifications],
    );

    const hasUnread = unreadCount > 0;

    const markRead = useCallback((id: string) => {
        readIds.add(id);
        emitChange();
    }, []);

    const markAllRead = useCallback(() => {
        for (const n of notifications) readIds.add(n.id);
        emitChange();
    }, [notifications]);

    const dismiss = useCallback((id: string) => {
        dismissedIds.add(id);
        emitChange();
    }, []);

    return {
        notifications,
        grouped,
        unreadCount,
        hasUnread,
        markRead,
        markAllRead,
        dismiss,
        /** Raw unfiltered notifications for browser notification hook */
        allNotifications,
        /** Whether quiet hours are currently active */
        quietHoursActive: quietHoursEnabled && !!quietHoursStart && !!quietHoursEnd,
    };
}
