import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Device } from "@cadence/contracts/push";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { createExternalStore } from "../../lib/utils/external-store";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import {
    canPush,
    deviceStatus,
    duplicateRisk,
    forgetDevice,
    forgetThisDevice,
    hasNotificationApi,
    installId,
    isIosTab,
    listDevices,
    readLocalEnabled,
    registerThisDevice,
    sendServerTest,
    setDeviceEnabled,
    writeLocalEnabled,
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

interface LocalState {
    permission: NotificationPermissionState;
    busy: boolean;
    test: TestState;
    error: string | null;
    /** Why background delivery didn't connect, when the browser refused it. */
    pushIssue: "blocked" | null;
}

// One state for every surface (Settings, the center's offer, the dispatcher): a grant made anywhere is seen everywhere at once.
const store = createExternalStore<LocalState>({ permission: "default", busy: false, test: "idle", error: null, pushIssue: null });
const patch = (next: Partial<LocalState>) => store.set({ ...store.get(), ...next });

const OFFER_KEY = "cadence_notification_offer_dismissed";
const offerDismissed = () => { try { return window.localStorage.getItem(OFFER_KEY) === "1"; } catch { return false; } };

/** The state of reminders on this device and the account's other devices. Enable and test must be called from a tap. */
export function useDeviceDelivery() {
    const local = useSyncExternalStore(store.subscribe, store.get, store.get);
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { authReady, isAuthenticated, session } = useAuthState();
    const userId = session?.user.id;
    const accountOn = settings?.notifications?.browser ?? false;
    const iosTab = !IS_DESKTOP_RUNTIME && isIosTab();

    const devicesKey = queryKeys.settings.devices(userId);
    const { data: devices = [], isSuccess: devicesLoaded } = useQuery({
        queryKey: devicesKey,
        enabled: authReady && isAuthenticated,
        queryFn: () => listDevices(client),
        staleTime: STALE_TIMES.NOTIFICATIONS,
    });
    const setDevices = useCallback((rows: Device[]) => queryClient.setQueryData(devicesKey, rows), [queryClient, devicesKey]);

    const thisInstallId = typeof window === "undefined" ? "" : installId();
    const thisDevice = devices.find((device) => device.installId === thisInstallId);

    // Until the list loads (a cold start, no network), fall back to what this device last knew.
    const assumed = devicesLoaded ? thisDevice : thisDevice ?? (readLocalEnabled() && local.permission === "granted" ? { enabled: true, push: false } : undefined);
    useEffect(() => {
        if (devicesLoaded) writeLocalEnabled(!!thisDevice?.enabled);
    }, [devicesLoaded, thisDevice?.enabled]);

    const status: DeviceStatus = deviceStatus({
        unsupported: !IS_DESKTOP_RUNTIME && !hasNotificationApi(),
        iosTab,
        permission: local.permission,
        accountOn,
        thisDevice: assumed,
    });

    const refresh = useCallback(async () => {
        patch({ permission: await getNotificationPermission() });
        await queryClient.invalidateQueries({ queryKey: devicesKey });
    }, [queryClient, devicesKey]);

    /** Registers (or re-registers) this device and records why push didn't connect, if it didn't. */
    const register = useCallback(async () => {
        const result = await registerThisDevice(client);
        patch({ pushIssue: result.push === "blocked" ? "blocked" : null });
        if (result.devices) setDevices(result.devices);
        return result;
    }, [client, setDevices]);

    const enable = useCallback(async () => {
        patch({ busy: true, error: null, test: "idle" });
        try {
            // Straight from the tap: the browser only prompts inside a user gesture.
            const permission = IS_DESKTOP_RUNTIME
                ? await requestNotificationPermission()
                : Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
            patch({ permission });
            if (permission !== "granted") {
                patch({ error: permission === "denied" ? null : "Notifications weren't allowed. You can try again." });
                return;
            }
            if (!accountOn) updateSettings.mutate({ notifications: { browser: true } });
            const result = await register();
            if (result.push === "failed") patch({ error: "This device couldn't be registered. Check your connection and try again." });
            // A device turned off earlier (here or elsewhere) is switched back on by this tap.
            const row = result.devices?.find((device) => device.installId === thisInstallId);
            if (row && !row.enabled) setDevices(await setDeviceEnabled(client, thisInstallId, true).then((updated) => result.devices!.map((d) => d.installId === updated.installId ? updated : d)));
        } finally {
            patch({ busy: false });
        }
    }, [accountOn, client, register, setDevices, thisInstallId, updateSettings]);

    const disable = useCallback(async () => {
        writeLocalEnabled(false);
        patch({ test: "idle", error: null });
        await forgetThisDevice(client);
        setDevices(devices.filter((device) => device.installId !== thisInstallId));
    }, [client, devices, setDevices, thisInstallId]);

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

    const update = useMutation({
        mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setDeviceEnabled(client, id, enabled),
        onSuccess: (row) => setDevices(devices.map((device) => device.installId === row.installId ? row : device)),
    });

    const forget = useMutation({
        mutationFn: (id: string) => forgetDevice(client, id),
        onMutate: (id) => setDevices(devices.filter((device) => device.installId !== id)),
    });

    const duplicateHint = useMemo(() => duplicateRisk(devices, thisInstallId, status), [devices, status, thisInstallId]);

    return {
        status,
        /** The platform the copy should talk about. */
        desktop: IS_DESKTOP_RUNTIME,
        ...local,
        devices,
        thisInstallId,
        duplicateHint,
        enable,
        disable,
        runTest,
        /** Whether the person saw the test. */
        confirmTest: (received: boolean) => patch({ test: received ? "received" : "missing" }),
        recheck: refresh,
        setEnabled: (id: string, enabled: boolean) => update.mutate({ id, enabled }),
        forget: (id: string) => forget.mutate(id),
        /** The contextual offer in the notification center: only for a device that can be enabled and hasn't been waved off. */
        offerEnable: !!settings && status === "off" && !offerDismissed(),
        dismissOffer: () => { try { window.localStorage.setItem(OFFER_KEY, "1"); } catch { /* the offer returns next visit */ } patch({}); },
    };
}

/**
 * Mounted once in the shell: keeps the shared state fresh (a grant made in browser settings is seen on
 * return, no reload) and re-registers this device, which also marks it seen in the person's list.
 */
export function useDeviceDeliverySync() {
    const { status, recheck } = useDeviceDelivery();
    const client = useApiClient();
    const queryClient = useQueryClient();
    const userId = useAuthState().session?.user.id;
    const devicesKey = queryKeys.settings.devices(userId);
    const announced = useRef<string | null>(null);

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

    // Enabled here: say hello once per account per load, so the list shows it as used today and a
    // lapsed subscription (or one from before this release) reconnects without the person doing anything.
    useEffect(() => {
        if (!userId || announced.current === userId) return;
        if (status === "off" || status === "denied" || status === "unsupported" || status === "install") return;
        if (!IS_DESKTOP_RUNTIME && !canPush() && status !== "local") return;
        announced.current = userId;
        void registerThisDevice(client).then((result) => {
            patch({ pushIssue: result.push === "blocked" ? "blocked" : null });
            if (result.devices) queryClient.setQueryData(devicesKey, result.devices);
        });
    }, [status, client, userId, queryClient, devicesKey]);
}
