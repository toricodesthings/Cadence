import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { createExternalStore } from "../../lib/utils/external-store";
import {
    canPush,
    deviceStatus,
    hasNotificationApi,
    isIosTab,
    isRegistered,
    readDeviceOff,
    registerThisDevice,
    sendServerTest,
    unregisterThisDevice,
    writeDeviceOff,
    type DeviceStatus,
} from "../../lib/notifications/device-delivery";
import {
    getNotificationPermission,
    IS_DESKTOP_RUNTIME,
    requestNotificationPermission,
    sendPlatformNotification,
    warmPlatformRuntime,
    type NotificationPermissionState,
} from "../../platform/runtime";

export type TestState = "idle" | "sending" | "sent" | "received" | "missing" | "gone" | "failed";

interface DeviceState {
    permission: NotificationPermissionState;
    registered: boolean;
    deviceOff: boolean;
    busy: boolean;
    test: TestState;
    error: string | null;
    /** Why background delivery didn't connect, when the browser refused it. */
    pushIssue: "blocked" | null;
}

// One state for every surface (Settings, the center's offer, the dispatcher): a grant made anywhere is seen everywhere at once.
const store = createExternalStore<DeviceState>({ permission: "default", registered: false, deviceOff: readDeviceOff(), busy: false, test: "idle", error: null, pushIssue: null });
const patch = (next: Partial<DeviceState>) => store.set({ ...store.get(), ...next });

const OFFER_KEY = "cadence_notification_offer_dismissed";
const offerDismissed = () => { try { return window.localStorage.getItem(OFFER_KEY) === "1"; } catch { return false; } };

/** The state of reminders on this device, plus the actions that change it. Enable and test must be called from a tap. */
export function useDeviceDelivery() {
    const state = useSyncExternalStore(store.subscribe, store.get, store.get);
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const client = useApiClient();
    const userId = useAuthState().session?.user.id;
    const accountOn = settings?.notifications?.browser ?? false;
    const iosTab = !IS_DESKTOP_RUNTIME && isIosTab();

    const status: DeviceStatus = deviceStatus({
        desktop: IS_DESKTOP_RUNTIME,
        unsupported: !IS_DESKTOP_RUNTIME && !hasNotificationApi(),
        iosTab,
        permission: state.permission,
        accountOn,
        deviceOff: state.deviceOff,
        registered: state.registered,
    });

    const refresh = useCallback(async () => {
        const [permission, registered] = await Promise.all([getNotificationPermission(), IS_DESKTOP_RUNTIME ? false : isRegistered(userId)]);
        patch({ permission, registered });
    }, [userId]);

    const enable = useCallback(async () => {
        patch({ busy: true, error: null, test: "idle" });
        try {
            // Straight from the tap: the browser only prompts inside a user gesture.
            const permission = IS_DESKTOP_RUNTIME
                ? await requestNotificationPermission()
                : Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
            await refresh();
            if (permission !== "granted") {
                patch({ error: permission === "denied" ? null : "Notifications weren't allowed. You can try again." });
                return;
            }
            writeDeviceOff(false);
            patch({ deviceOff: false });
            if (!accountOn) updateSettings.mutate({ notifications: { browser: true } });
            if (!IS_DESKTOP_RUNTIME && userId && canPush()) {
                const result = await registerThisDevice(client, userId);
                patch({ pushIssue: result === "blocked" ? "blocked" : null });
                if (result === "unavailable" || result === "failed") patch({ error: "Reminders will show while Cadence is open. Background delivery isn't available right now." });
                await refresh();
            }
        } finally {
            patch({ busy: false });
        }
    }, [accountOn, client, refresh, updateSettings, userId]);

    const disable = useCallback(async () => {
        writeDeviceOff(true);
        patch({ deviceOff: true, test: "idle", error: null });
        if (!IS_DESKTOP_RUNTIME) await unregisterThisDevice(client, userId);
        await refresh();
    }, [client, refresh, userId]);

    const runTest = useCallback(async () => {
        patch({ test: "sending", error: null });
        if (status === "connected") {
            const outcome = await sendServerTest(client);
            patch({ test: outcome === "accepted" ? "sent" : outcome });
            if (outcome === "gone") await refresh();
            return;
        }
        try {
            await sendPlatformNotification({ title: "Cadence test notification", body: "If you can see this, reminders can appear on this device.", icon: "/logo.png", route: "/" });
            patch({ test: "sent" });
        } catch {
            patch({ test: "failed" });
        }
    }, [client, refresh, status]);

    return {
        status,
        /** The platform the copy should talk about. */
        desktop: IS_DESKTOP_RUNTIME,
        ...state,
        enable,
        disable,
        runTest,
        /** Whether the person saw the test. */
        confirmTest: (received: boolean) => patch({ test: received ? "received" : "missing" }),
        recheck: refresh,
        /** The contextual offer in the notification center: only for a device that can be enabled and hasn't been waved off. */
        offerEnable: !!settings && status === "off" && !offerDismissed(),
        dismissOffer: () => { try { window.localStorage.setItem(OFFER_KEY, "1"); } catch { /* the offer returns next visit */ } patch({}); },
    };
}

/**
 * Mounted once in the shell: keeps the shared state fresh (a grant made in browser settings is seen on
 * return, no reload) and quietly reconnects a device that already has permission.
 */
export function useDeviceDeliverySync() {
    const { status, recheck } = useDeviceDelivery();
    const client = useApiClient();
    const userId = useAuthState().session?.user.id;
    const attempted = useRef<string | null>(null);

    useEffect(() => {
        warmPlatformRuntime();
        void recheck();
        const onShow = () => { if (document.visibilityState === "visible") void recheck(); };
        window.addEventListener("focus", onShow);
        document.addEventListener("visibilitychange", onShow);
        return () => {
            window.removeEventListener("focus", onShow);
            document.removeEventListener("visibilitychange", onShow);
        };
    }, [recheck]);

    // Already allowed and switched on, but not yet saved with the server (first run after this release, a new account, an expired registration).
    useEffect(() => {
        if (status !== "local" || IS_DESKTOP_RUNTIME || !userId || !canPush() || attempted.current === userId) return;
        attempted.current = userId;
        void registerThisDevice(client, userId).then((result) => {
            patch({ pushIssue: result === "blocked" ? "blocked" : null });
            return recheck();
        });
    }, [status, client, userId, recheck]);
}
