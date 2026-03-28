import { useMemo, useCallback, useSyncExternalStore, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTasks } from "../tasks";
import { useAllHabits } from "../habits/use-habits";
import { useSettings } from "../core/use-settings";
import { useApiClient } from "../auth/use-api-client";
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
import { unwrapResponse } from "../../lib/api/helpers";

const NOTIFICATION_STATE_STORAGE_KEY = "cadence_notification_state";

interface PersistedNotificationState {
    dismissedIds: string[];
    readIds: string[];
    deferredUntilEntries: Array<[string, string]>;
}

interface NotificationStateRow {
    objectType: "task" | "habit" | "event";
    objectId: string;
    triggerId: string;
    firstPresentedAt: string | null;
    lastPresentedAt: string | null;
    dismissedAt: string | null;
    deferredUntil: string | null;
    actionTaken: string | null;
    presentationCount: number;
}

function readPersistedState(): PersistedNotificationState {
    if (typeof window === "undefined") {
        return { dismissedIds: [], readIds: [], deferredUntilEntries: [] };
    }

    try {
        const raw = window.localStorage.getItem(NOTIFICATION_STATE_STORAGE_KEY);
        if (!raw) return { dismissedIds: [], readIds: [], deferredUntilEntries: [] };
        const parsed = JSON.parse(raw) as Partial<PersistedNotificationState>;
        return {
            dismissedIds: Array.isArray(parsed.dismissedIds) ? parsed.dismissedIds : [],
            readIds: Array.isArray(parsed.readIds) ? parsed.readIds : [],
            deferredUntilEntries: Array.isArray(parsed.deferredUntilEntries) ? parsed.deferredUntilEntries as Array<[string, string]> : [],
        };
    } catch {
        return { dismissedIds: [], readIds: [], deferredUntilEntries: [] };
    }
}

function writePersistedState() {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(
            NOTIFICATION_STATE_STORAGE_KEY,
            JSON.stringify({
                dismissedIds: Array.from(dismissedIds),
                readIds: Array.from(readIds),
                deferredUntilEntries: Array.from(deferredUntil.entries()),
            } satisfies PersistedNotificationState),
        );
    } catch {
        // Persistence is best-effort.
    }
}

function toNotificationRecord(notification: AppNotification): { objectType: "task" | "habit" | "event"; objectId: string; triggerId: string } | null {
    if (!notification.entityId) return null;

    return {
        objectType: notification.kind === "habit-reminder" ? "habit" : notification.kind === "system" ? "event" : "task",
        objectId: notification.entityId,
        triggerId: notification.id,
    };
}

// ── §11.7: Persistent dismissal/deferral store (session-scoped) ──
const initialPersistedState = readPersistedState();
const dismissedIds = new Set<string>(initialPersistedState.dismissedIds);
const readIds = new Set<string>(initialPersistedState.readIds);
const deferredUntil = new Map<string, string>(initialPersistedState.deferredUntilEntries);
let storeVersion = 0;
const listeners = new Set<() => void>();

function emitChange() {
    writePersistedState();
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
    const client = useApiClient();
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
    const presentedRef = useRef<Set<string>>(new Set());

    const { data: persistedRows = [] } = useQuery({
        queryKey: ["notification-state"],
        queryFn: async () => {
            const res = await client.api.settings["notification-state"].$get();
            return unwrapResponse<NotificationStateRow[]>(res);
        },
        staleTime: 60_000,
    });

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

    useEffect(() => {
        if (!persistedRows.length) return;

        let changed = false;
        for (const row of persistedRows) {
            if (row.dismissedAt && !dismissedIds.has(row.triggerId)) {
                dismissedIds.add(row.triggerId);
                changed = true;
            }
            if (row.actionTaken === "read" && !readIds.has(row.triggerId)) {
                readIds.add(row.triggerId);
                changed = true;
            }
            if (row.deferredUntil && deferredUntil.get(row.triggerId) !== row.deferredUntil) {
                deferredUntil.set(row.triggerId, row.deferredUntil);
                changed = true;
            }
        }

        if (changed) emitChange();
    }, [persistedRows]);

    const syncNotificationState = useCallback(async (notification: AppNotification, payload: Omit<NotificationStateRow, "triggerId" | "objectId" | "objectType" | "presentationCount"> & { presentationCountIncrement?: number }) => {
        const record = toNotificationRecord(notification);
        if (!record) return;

        try {
            await client.api.settings["notification-state"].$post({
                json: {
                    ...record,
                    firstPresentedAt: payload.firstPresentedAt,
                    lastPresentedAt: payload.lastPresentedAt,
                    dismissedAt: payload.dismissedAt,
                    deferredUntil: payload.deferredUntil,
                    actionTaken: payload.actionTaken,
                    presentationCountIncrement: payload.presentationCountIncrement,
                },
            });
        } catch {
            // Best-effort sync; local persistence remains authoritative until next refresh.
        }
    }, [client]);

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

    useEffect(() => {
        const nowIso = new Date().toISOString();

        for (const notification of notifications) {
            if (presentedRef.current.has(notification.id)) continue;
            presentedRef.current.add(notification.id);
            trackUsageEvent("reminder.presented", {
                object_type: notification.kind === "habit-reminder" ? "habit" : notification.kind === "system" ? "event" : "task",
            });
            void syncNotificationState(notification, {
                firstPresentedAt: nowIso,
                lastPresentedAt: nowIso,
                dismissedAt: null,
                deferredUntil: null,
                actionTaken: "presented",
                presentationCountIncrement: 1,
            });
        }
    }, [notifications, syncNotificationState]);

    const markRead = useCallback((id: string) => {
        readIds.add(id);
        emitChange();
        const notification = notifications.find((item) => item.id === id);
        if (notification) {
            void syncNotificationState(notification, {
                firstPresentedAt: null,
                lastPresentedAt: new Date().toISOString(),
                dismissedAt: null,
                deferredUntil: null,
                actionTaken: "read",
            });
        }
    }, [notifications, syncNotificationState]);

    const markAllRead = useCallback(() => {
        for (const n of notifications) {
            readIds.add(n.id);
            void syncNotificationState(n, {
                firstPresentedAt: null,
                lastPresentedAt: new Date().toISOString(),
                dismissedAt: null,
                deferredUntil: null,
                actionTaken: "read",
            });
        }
        emitChange();
    }, [notifications, syncNotificationState]);

    const dismiss = useCallback((id: string) => {
        trackUsageEvent("reminder.dismissed");
        dismissedIds.add(id);
        emitChange();
        const notification = notifications.find((item) => item.id === id);
        if (notification) {
            void syncNotificationState(notification, {
                firstPresentedAt: null,
                lastPresentedAt: new Date().toISOString(),
                dismissedAt: new Date().toISOString(),
                deferredUntil: null,
                actionTaken: "dismissed",
            });
        }
    }, [notifications, syncNotificationState]);

    /** §11.7: Defer a notification — it will resurface after the chosen delay */
    const defer = useCallback((id: string, choice: DeferChoice) => {
        trackUsageEvent("reminder.deferred", { outcome: choice });
        const until = computeDeferUntil(choice, new Date());
        deferredUntil.set(id, until);
        emitChange();
        const notification = notifications.find((item) => item.id === id);
        if (notification) {
            void syncNotificationState(notification, {
                firstPresentedAt: null,
                lastPresentedAt: new Date().toISOString(),
                dismissedAt: null,
                deferredUntil: until,
                actionTaken: "deferred",
            });
        }
    }, [notifications, syncNotificationState]);

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
