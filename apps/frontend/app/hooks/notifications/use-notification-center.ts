import { useMemo, useCallback, useSyncExternalStore, useRef, useEffect, useContext } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { NotificationState, UpsertNotificationState } from "@cadence/contracts/notification";
import { useTasks } from "../tasks/use-tasks";
import { useHabitsRange } from "../habits/use-habits";
import { useToday } from "../../lib/utils/user-zone";
import { useSettings } from "../core/use-settings";
import { usePersonalEvents } from "../calendar/use-personal-events";
import { SETTINGS_DEFAULTS } from "../../types/settings";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
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
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { createExternalStore } from "../../lib/utils/external-store";
import { StartupReadyContext } from "../core/use-workspace-startup";

const presentedByClient = new WeakMap<QueryClient, Set<string>>();
const getPresentedIds = (client: QueryClient) =>
    presentedByClient.get(client) ?? presentedByClient.set(client, new Set()).get(client)!;

const NOTIFICATION_STATE_STORAGE_KEY = "cadence_notification_state";

interface PersistedNotificationState {
    dismissedIds: string[];
    readIds: string[];
    deferredUntilEntries: Array<[string, string]>;
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
            deferredUntilEntries: Array.isArray(parsed.deferredUntilEntries)
                ? (parsed.deferredUntilEntries as Array<[string, string]>)
                : [],
        };
    } catch {
        return { dismissedIds: [], readIds: [], deferredUntilEntries: [] };
    }
}

export function clearPersistedNotificationState() {
    try {
        window.localStorage.removeItem(NOTIFICATION_STATE_STORAGE_KEY);
    } catch {}
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
    } catch {}
}

function actedOn(
    actionTaken: UpsertNotificationState["actionTaken"],
    now: string,
    extra: { dismissedAt?: string; deferredUntil?: string } = {},
) {
    return {
        firstPresentedAt: null,
        lastPresentedAt: now,
        dismissedAt: null,
        deferredUntil: null,
        actionTaken,
        ...extra,
    };
}

function toNotificationRecord(
    notification: AppNotification,
): { objectType: NotificationState["objectType"]; objectId: string; triggerId: string } | null {
    if (!notification.entityId) return null;

    return {
        objectType:
            notification.kind === "habit-reminder"
                ? "habit"
                : notification.kind === "system" || notification.kind === "personal-event"
                  ? "event"
                  : "task",
        objectId: notification.entityId,
        triggerId: notification.id,
    };
}

const initialPersistedState = readPersistedState();
const dismissedIds = new Set<string>(initialPersistedState.dismissedIds);
const readIds = new Set<string>(initialPersistedState.readIds);
const deferredUntil = new Map<string, string>(initialPersistedState.deferredUntilEntries);
const versionStore = createExternalStore(0);

function emitChange() {
    writePersistedState();
    versionStore.set(versionStore.get() + 1);
}

export function getDismissalState(): NotificationDismissalState {
    return { dismissedIds, deferredUntil };
}

export interface GroupedNotifications {
    group: NotificationGroup;
    label: string;
    items: AppNotification[];
}

export function useNotificationCenter() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { data: settings } = useSettings();
    const notif = settings?.notifications;
    const prefs = useMemo(() => ({ ...SETTINGS_DEFAULTS.notifications, ...notif }), [notif]);
    const { quietHoursEnabled, quietHoursStart, quietHoursEnd } = prefs;
    const bundleMissedHabits = notif?.bundleMissedRoutinePrompts !== false;
    const { enabled: eventsEnabled, items: eventItems } = usePersonalEvents(new Date().getFullYear());
    const notifiedEvents = useMemo(() => (eventsEnabled ? eventItems : []), [eventsEnabled, eventItems]);

    const revealed = useContext(StartupReadyContext);
    const { data: activeTasks } = useTasks({ state: "ACTIVE", enabled: revealed });
    const { data: waitingTasks } = useTasks({ state: "WAITING", enabled: revealed });
    const tasks = useMemo(() => [...(activeTasks ?? []), ...(waitingTasks ?? [])], [activeTasks, waitingTasks]);
    const today = useToday();
    const { data: habits = [] } = useHabitsRange({ start: today, end: today, enabled: revealed });
    const { authReady, isAuthenticated, session } = useAuthState();
    const userId = session?.user.id;
    const stateKey = queryKeys.settings.notificationState(userId);
    const { data: persistedRows = [], isSuccess: stateLoaded } = useQuery({
        queryKey: stateKey,
        enabled: revealed && authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.settings["notification-state"].$get();
            return unwrapResponse(res);
        },
        staleTime: STALE_TIMES.NOTIFICATIONS,
    });

    const version = useSyncExternalStore(versionStore.subscribe, versionStore.get, versionStore.get);

    const nowRef = useRef(new Date());
    useEffect(() => {
        const id = setInterval(() => {
            nowRef.current = new Date();
            emitChange();
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
            if (row.actionTaken === "unread" && readIds.delete(row.triggerId)) changed = true;
            if (row.deferredUntil && deferredUntil.get(row.triggerId) !== row.deferredUntil) {
                deferredUntil.set(row.triggerId, row.deferredUntil);
                changed = true;
            }
        }

        if (changed) emitChange();
    }, [persistedRows]);

    const syncNotificationState = useCallback(
        async (
            notification: AppNotification,
            payload: Omit<UpsertNotificationState, "triggerId" | "objectId" | "objectType">,
        ) => {
            const record = toNotificationRecord(notification);
            if (!record || !authReady || !isAuthenticated || !userId) return false;

            try {
                const response = await client.api.settings["notification-state"].$post({
                    json: { ...record, ...payload },
                });
                const row = await unwrapResponse(response);
                queryClient.setQueryData<NotificationState[]>(
                    queryKeys.settings.notificationState(userId),
                    (rows = []) => {
                        const existing = rows.find(
                            (item) => item.objectId === row.objectId && item.triggerId === row.triggerId,
                        );
                        if (existing && existing.updatedAt > row.updatedAt) return rows;
                        return [...rows.filter((item) => item !== existing), row];
                    },
                );
                return true;
            } catch {
                return false;
            }
        },
        [client, queryClient, authReady, isAuthenticated, userId],
    );

    const allNotifications = useMemo(() => {
        const now = nowRef.current;
        const candidates = deriveCandidates(tasks, habits, now, { personalEvents: notifiedEvents, prefs });
        const filtered = filterByBehavior(candidates, now, {
            ...prefs,
            bundleMissedHabits,
            hidden: getDismissalState(),
        });
        filtered.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
            return new Date(b.triggerAt).getTime() - new Date(a.triggerAt).getTime();
        });
        return filtered;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks, habits, notifiedEvents, prefs, bundleMissedHabits, version]);

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
        return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
            group: g,
            label: g === "now" ? "Now" : g === "today" ? "Today" : "Earlier",
            items: groups.get(g)!,
        })) satisfies GroupedNotifications[];
    }, [notifications]);

    const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

    const hasUnread = unreadCount > 0;

    useEffect(() => {
        if (!authReady || !isAuthenticated || !userId || !stateLoaded) return;
        const presentedIds = getPresentedIds(queryClient);
        const persistedIds = new Set(persistedRows.filter((row) => row.firstPresentedAt).map((row) => row.triggerId));
        const nowIso = new Date().toISOString();

        for (const notification of notifications) {
            const claim = `${userId}:${notification.id}`;
            if (presentedIds.has(claim) || persistedIds.has(notification.id)) continue;
            presentedIds.add(claim);
            trackUsageEvent("reminder.presented", {
                object_type:
                    notification.kind === "habit-reminder"
                        ? "habit"
                        : notification.kind === "system"
                          ? "event"
                          : "task",
            });
            void syncNotificationState(notification, {
                firstPresentedAt: nowIso,
                lastPresentedAt: nowIso,
                presentationCountIncrement: 1,
            }).then((synced) => {
                if (!synced) presentedIds.delete(claim);
            });
        }
    }, [
        notifications,
        syncNotificationState,
        authReady,
        isAuthenticated,
        userId,
        stateLoaded,
        persistedRows,
        queryClient,
    ]);

    const setRead = useCallback(
        (id: string, read: boolean) => {
            if (read) readIds.add(id);
            else readIds.delete(id);
            emitChange();
            const notification = notifications.find((item) => item.id === id);
            if (notification) {
                void syncNotificationState(notification, actedOn(read ? "read" : "unread", new Date().toISOString()));
            }
        },
        [notifications, syncNotificationState],
    );

    const markRead = useCallback((id: string) => setRead(id, true), [setRead]);
    const markUnread = useCallback((id: string) => setRead(id, false), [setRead]);

    const markAllRead = useCallback(() => {
        for (const n of notifications) {
            readIds.add(n.id);
            void syncNotificationState(n, actedOn("read", new Date().toISOString()));
        }
        emitChange();
    }, [notifications, syncNotificationState]);

    const dismissMany = useCallback(
        (ids: string[]) => {
            const selected = new Set(ids);
            const nowIso = new Date().toISOString();
            for (const notification of notifications) {
                if (!selected.has(notification.id)) continue;
                trackUsageEvent("reminder.dismissed");
                dismissedIds.add(notification.id);
                void syncNotificationState(notification, actedOn("dismissed", nowIso, { dismissedAt: nowIso }));
            }
            emitChange();
        },
        [notifications, syncNotificationState],
    );

    const dismiss = useCallback((id: string) => dismissMany([id]), [dismissMany]);

    const defer = useCallback(
        (id: string, choice: DeferChoice) => {
            trackUsageEvent("reminder.deferred", { outcome: choice });
            const until = computeDeferUntil(choice, new Date(), prefs);
            deferredUntil.set(id, until);
            emitChange();
            const notification = notifications.find((item) => item.id === id);
            if (notification) {
                void syncNotificationState(
                    notification,
                    actedOn("deferred", new Date().toISOString(), { deferredUntil: until }),
                );
            }
        },
        [notifications, syncNotificationState, prefs],
    );

    return {
        notifications,
        grouped,
        unreadCount,
        hasUnread,
        markRead,
        markUnread,
        markAllRead,
        dismiss,
        dismissMany,
        defer,
        allNotifications,
        quietHoursActive: quietHoursEnabled && !!quietHoursStart && !!quietHoursEnd,
    };
}
