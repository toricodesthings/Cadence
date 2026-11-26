import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Device } from "@cadence/contracts/push";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { createExternalStore } from "../../lib/utils/external-store";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { WAKE_EVENT } from "../core/use-wake-refresh";
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
    pushIssue: "blocked" | null;
}

const store = createExternalStore<LocalState>({
    permission: "default",
    busy: false,
    test: "idle",
    error: null,
    pushIssue: null,
});
const patch = (next: Partial<LocalState>) => store.set({ ...store.get(), ...next });

const OFFER_KEY = "cadence_notification_offer_dismissed";
let announcedFor: string | null = null;
const offerDismissed = () => {
    try {
        return window.localStorage.getItem(OFFER_KEY) === "1";
    } catch {
        return false;
    }
};

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

    const devicesKey = useMemo(() => queryKeys.settings.devices(userId), [userId]);
    const { data: devices = [], isSuccess: devicesLoaded } = useQuery({
        queryKey: devicesKey,
        enabled: authReady && isAuthenticated,
        queryFn: () => listDevices(client),
        staleTime: STALE_TIMES.NOTIFICATIONS,
    });
    const setDevices = useCallback(
        (rows: Device[]) => queryClient.setQueryData(devicesKey, rows),
        [queryClient, devicesKey],
    );

    const thisInstallId = installId();
    const thisDevice = devices.find((device) => device.installId === thisInstallId);

    const assumed = devicesLoaded
        ? thisDevice
        : (thisDevice ??
          (readLocalEnabled() && local.permission === "granted" ? { enabled: true, push: false } : undefined));
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

    const register = useCallback(async () => {
        const result = await registerThisDevice(client);
        patch({ pushIssue: result.push === "blocked" ? "blocked" : null });
        if (result.devices) setDevices(result.devices);
        return result;
    }, [client, setDevices]);

    const enable = useCallback(async () => {
        patch({ busy: true, error: null, test: "idle" });
        try {
            const permission = IS_DESKTOP_RUNTIME
                ? await requestNotificationPermission()
                : Notification.permission === "granted"
                  ? "granted"
                  : await Notification.requestPermission();
            patch({ permission });
            if (permission !== "granted") {
                patch({ error: permission === "denied" ? null : "Notifications weren't allowed. You can try again." });
                return;
            }
            if (!accountOn) updateSettings.mutate({ notifications: { browser: true } });
            const result = await register();
            if (result.push === "failed")
                patch({ error: "This device couldn't be registered. Check your connection and try again." });
            const row = result.devices?.find((device) => device.installId === thisInstallId);
            if (row && !row.enabled)
                setDevices(
                    await setDeviceEnabled(client, thisInstallId, true).then((updated) =>
                        result.devices!.map((d) => (d.installId === updated.installId ? updated : d)),
                    ),
                );
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
            await sendPlatformNotification({
                title: "Cadence test notification",
                body: "If you can see this, reminders can appear on this device.",
                icon: "/logo.png",
                route: "/",
            });
            patch({ test: "sent" });
        } catch {
            patch({ test: "failed" });
        }
    }, [client, refresh, status]);

    const update = useMutation({
        mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setDeviceEnabled(client, id, enabled),
        onSuccess: (row) => setDevices(devices.map((device) => (device.installId === row.installId ? row : device))),
    });

    const forget = useMutation({
        mutationFn: (id: string) => forgetDevice(client, id),
        onMutate: (id) => setDevices(devices.filter((device) => device.installId !== id)),
    });

    const duplicateHint = useMemo(
        () => duplicateRisk(devices, thisInstallId, status),
        [devices, status, thisInstallId],
    );

    return {
        status,
        desktop: IS_DESKTOP_RUNTIME,
        ...local,
        devices,
        thisInstallId,
        duplicateHint,
        enable,
        disable,
        runTest,
        confirmTest: (received: boolean) => patch({ test: received ? "received" : "missing" }),
        recheck: refresh,
        setEnabled: (id: string, enabled: boolean) => update.mutate({ id, enabled }),
        forget: (id: string) => forget.mutate(id),
        offerEnable: !!settings && status === "off" && !offerDismissed(),
        dismissOffer: () => {
            try {
                window.localStorage.setItem(OFFER_KEY, "1");
            } catch {}
            patch({});
        },
    };
}

export function useDeviceDeliverySync() {
    const { status, recheck } = useDeviceDelivery();
    const client = useApiClient();
    const queryClient = useQueryClient();
    const userId = useAuthState().session?.user.id;
    const devicesKey = useMemo(() => queryKeys.settings.devices(userId), [userId]);

    useEffect(() => {
        warmPlatformRuntime();
        void recheck();
        const onShow = () => {
            if (document.visibilityState === "visible") void recheck();
        };
        const onWake = () => void recheck();
        window.addEventListener("focus", onShow);
        window.addEventListener(WAKE_EVENT, onWake);
        document.addEventListener("visibilitychange", onShow);
        return () => {
            window.removeEventListener(WAKE_EVENT, onWake);
            window.removeEventListener("focus", onShow);
            document.removeEventListener("visibilitychange", onShow);
        };
    }, [recheck]);

    useEffect(() => {
        if (!userId || announcedFor === userId) return;
        if (status === "off" || status === "denied" || status === "unsupported" || status === "install") return;
        if (!IS_DESKTOP_RUNTIME && !canPush() && status !== "local") return;
        announcedFor = userId;
        void registerThisDevice(client).then((result) => {
            patch({ pushIssue: result.push === "blocked" ? "blocked" : null });
            if (result.devices) queryClient.setQueryData(devicesKey, result.devices);
        });
    }, [status, client, userId, queryClient, devicesKey]);
}
