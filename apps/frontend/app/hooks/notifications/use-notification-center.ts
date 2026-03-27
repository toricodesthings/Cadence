import { useMemo, useCallback, useSyncExternalStore, useRef, useEffect } from "react";
import { useTasks } from "../tasks";
import { useAllHabits } from "../habits/use-habits";
import { useSettings } from "../core/use-settings";
import {
    deriveCandidates,
    filterByBehavior,
    applyPresentationRules,
    computeDeferUntil,
    type DeferChoice,
    type NotificationDismissalState,
} from "../../lib/notifications/reminder-engine";
import type { AppNotification, NotificationGroup } from "../../lib/notifications/notification-model";
import { groupNotification, GROUP_ORDER } from "../../lib/notifications/notification-model";
import { trackUsageEvent } from "../../lib/api/track-event";

// ── §11.7: Persistent dismissal/deferral store (session-scoped) ──
const dismissedIds = new Set<string>();
const readIds = new Set<string>();
const deferredUntil = new Map<string, string>();
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

function getDismissalState(): NotificationDismissalState {
    return { dismissedIds, deferredUntil };
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

    // Track version so we re-derive when read/dismissed/deferred changes
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

    // §11.7: 3-step pipeline — candidates → behavior filter → presentation rules
    const allNotifications = useMemo(() => {
        const now = nowRef.current;
        // Step 1: Pure candidate derivation
        const candidates = deriveCandidates(tasks, habits, now);
        // Step 2: Behavior filtering (preferences, quiet hours, bundling)
        const filtered = filterByBehavior(candidates, now, {
            taskReminders,
            habitReminders,
            dueDateAlerts,
            quietHoursEnabled,
            quietHoursStart,
            quietHoursEnd,
        });
        // Sort: high priority first, then by trigger time
        filtered.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
            return new Date(b.triggerAt).getTime() - new Date(a.triggerAt).getTime();
        });
        return filtered;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks, habits, taskReminders, habitReminders, dueDateAlerts, quietHoursEnabled, quietHoursStart, quietHoursEnd, version]);

    // Step 3: Persistence-aware presentation
    const notifications = useMemo(() => {
        const presented = applyPresentationRules(allNotifications, getDismissalState(), nowRef.current);
        return presented.map((n) => ({ ...n, read: readIds.has(n.id) }));
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
        trackUsageEvent("reminder.presented");
        readIds.add(id);
        emitChange();
    }, []);

    const markAllRead = useCallback(() => {
        for (const n of notifications) readIds.add(n.id);
        emitChange();
    }, [notifications]);

    const dismiss = useCallback((id: string) => {
        trackUsageEvent("reminder.dismissed");
        dismissedIds.add(id);
        emitChange();
    }, []);

    /** §11.7: Defer a notification — it will resurface after the chosen delay */
    const defer = useCallback((id: string, choice: DeferChoice) => {
        trackUsageEvent("reminder.deferred", { outcome: choice });
        const until = computeDeferUntil(choice, new Date());
        deferredUntil.set(id, until);
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
        /** §11.7: Defer a notification */
        defer,
        /** Raw unfiltered notifications for browser notification hook */
        allNotifications,
        /** Whether quiet hours are currently active */
        quietHoursActive: quietHoursEnabled && !!quietHoursStart && !!quietHoursEnd,
    };
}
