import type { Device, DeviceKind } from "@cadence/contracts/push";
import type { ApiClient } from "../api/client";
import { unwrapResponse } from "../api/helpers";
import { IS_DESKTOP_RUNTIME, type NotificationPermissionState } from "../../platform/runtime";

/**
 * What this device can do about reminders, in the one vocabulary Settings, the
 * notification center and the dispatcher share:
 * - unsupported: this browser can't show notifications at all
 * - install: an iPhone/iPad tab; push works only from the Home Screen app
 * - denied: the browser/OS blocks Cadence (only the person can undo that)
 * - off: not enabled here, or switched off from here or another device
 * - connected: the server pushes reminders here, even with Cadence closed
 * - local: Cadence shows reminders itself, only while it is running
 */
export type DeviceStatus = "unsupported" | "install" | "denied" | "off" | "connected" | "local";

export interface DeviceFacts {
    /** No Notification API (and not an iOS tab). */
    unsupported: boolean;
    iosTab: boolean;
    permission: NotificationPermissionState;
    /** The account's master switch for device reminders. */
    accountOn: boolean;
    /** This device's own row, once the server list has loaded. */
    thisDevice: Pick<Device, "enabled" | "push"> | undefined;
}

export function deviceStatus(f: DeviceFacts): DeviceStatus {
    if (f.iosTab) return "install";
    if (f.unsupported) return "unsupported";
    if (f.permission === "denied") return "denied";
    if (f.permission !== "granted" || !f.accountOn) return "off";
    if (!f.thisDevice || !f.thisDevice.enabled) return "off";
    return f.thisDevice.push ? "connected" : "local";
}

/**
 * The only overlap Cadence can see but can't resolve: the desktop app alerts while it runs, and a
 * browser on the same computer is pushed to as well. Nothing tells the server they share a machine
 * (browsers expose no machine identity), so this only ever suggests — silently silencing one would
 * cost a reminder on a second computer, and a missed reminder is worse than a repeated one.
 * The app is the one to drop: a browser's push covers closed Cadence too.
 */
export function duplicateRisk(devices: Device[], thisInstallId: string, status: DeviceStatus):
    { kind: "app-also" | "browser-also"; device: Device } | null {
    if (status !== "connected" && status !== "local") return null;
    const other = (kind: DeviceKind) => devices.find((device) => device.kind === kind && device.enabled && device.installId !== thisInstallId);
    const here = devices.find((device) => device.installId === thisInstallId);
    if (!here?.enabled) return null;
    if (here.kind === "computer" && here.push) {
        const app = other("desktop-app");
        return app ? { kind: "app-also", device: app } : null;
    }
    if (here.kind === "desktop-app") {
        const browser = devices.find((device) => device.kind === "computer" && device.push && device.enabled && device.installId !== thisInstallId);
        return browser ? { kind: "browser-also", device: browser } : null;
    }
    return null;
}

const INSTALL_KEY = "cadence_install_id";
const ENABLED_KEY = "cadence_device_enabled";

function storage<T>(fn: (s: Storage) => T, fallback: T): T {
    try { return fn(window.localStorage); } catch { return fallback; }
}

/**
 * This browser profile's (or app install's) stable identity. It survives a changed push endpoint,
 * so a device never turns into a second row in the person's list.
 */
export function installId(): string {
    const saved = storage((s) => s.getItem(INSTALL_KEY), null);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    storage((s) => s.setItem(INSTALL_KEY, fresh), undefined);
    return fresh;
}

/**
 * Last known answer for "are reminders on here", so a cold start with no network still alerts
 * (a missed reminder is worse than one the person meant to silence). The server row is the truth.
 */
export const readLocalEnabled = () => typeof window !== "undefined" && storage((s) => s.getItem(ENABLED_KEY) !== "0", true);
export const writeLocalEnabled = (enabled: boolean) => storage((s) => s.setItem(ENABLED_KEY, enabled ? "1" : "0"), undefined);

export const isBrave = () => typeof navigator !== "undefined" && "brave" in navigator;

const isIosDevice = () => typeof navigator !== "undefined"
    && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isStandalone = () => typeof window !== "undefined"
    && ((navigator as Navigator & { standalone?: boolean }).standalone === true || !!window.matchMedia?.("(display-mode: standalone)").matches);

/** iPhone/iPad outside the installed Home Screen app: no push, no Notification API. */
export const isIosTab = () => isIosDevice() && !isStandalone();

export const hasNotificationApi = () => typeof window !== "undefined" && "Notification" in window;
export const canPush = () => hasNotificationApi() && "serviceWorker" in navigator && "PushManager" in window;

function osName(): string {
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
    if (/Windows/.test(ua)) return "Windows";
    if (/Android/.test(ua)) return "Android";
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua) || isIosDevice()) return "iPad";
    if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
    if (/Linux/.test(ua)) return "Linux";
    return "this device";
}

function browserName(): string {
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
    if (isBrave()) return "Brave";
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\/|Opera/.test(ua)) return "Opera";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\/|Chromium\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "Browser";
}

/** How this device introduces itself in the person's device list. */
export function describeDevice(): { kind: DeviceKind; label: string } {
    if (IS_DESKTOP_RUNTIME) return { kind: "desktop-app", label: `Cadence app on ${osName()}` };
    const mobile = isIosDevice() || /Android/.test(navigator.userAgent);
    const kind: DeviceKind = mobile ? "phone" : "computer";
    return { kind, label: isStandalone() ? `Cadence on ${osName()}` : `${browserName()} on ${osName()}` };
}

const bytesOf = (text: string) => {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
};

/** The service worker registration, once active; null if there isn't one soon (dev builds, blocked workers). */
export async function readyRegistration(timeoutMs = 8_000): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return Promise.race([navigator.serviceWorker.ready, timeout]).catch(() => null);
}

async function currentSubscription(): Promise<PushSubscription | null> {
    if (!canPush()) return null;
    const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    return (await registration?.pushManager.getSubscription().catch(() => null)) ?? null;
}

/**
 * This browser's Web Push subscription, resubscribing if the server's key changed.
 * "blocked" = the browser refused (Brave does this until its push setting is on).
 */
async function subscribeHere(client: ApiClient): Promise<PushSubscription | "unavailable" | "blocked"> {
    if (!canPush() || Notification.permission !== "granted") return "unavailable";
    const { publicKey } = await unwrapResponse(await client.api.push.config.$get());
    if (!publicKey) return "unavailable";
    const registration = await readyRegistration();
    if (!registration) return "unavailable";
    const key = bytesOf(publicKey);
    let subscription = await registration.pushManager.getSubscription();
    const sameKey = subscription?.options.applicationServerKey && new Uint8Array(subscription.options.applicationServerKey).join() === key.join();
    if (subscription && !sameKey) {
        await subscription.unsubscribe();
        subscription = null;
    }
    if (subscription) return subscription;
    try {
        return await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch {
        return "blocked";
    }
}

export type RegisterResult = { devices: Device[]; push: "connected" | "unavailable" | "blocked" } | { devices: null; push: "failed" };

/**
 * Registers this device and marks it seen, with a push subscription when the browser gives one.
 * A device without one is still listed and controllable; it just shows reminders itself while
 * Cadence runs. Never prompts: permission must already be granted.
 */
export async function registerThisDevice(client: ApiClient): Promise<RegisterResult> {
    try {
        const subscription = IS_DESKTOP_RUNTIME ? "unavailable" as const : await subscribeHere(client);
        const json = typeof subscription === "string"
            ? { ...describeDevice(), installId: installId(), subscription: null }
            : (() => {
                const { endpoint, keys } = subscription.toJSON();
                return endpoint && keys?.p256dh && keys.auth
                    ? { ...describeDevice(), installId: installId(), subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } }
                    : null;
            })();
        if (!json) return { devices: null, push: "failed" };
        const devices = await unwrapResponse(await client.api.push.devices.$put({ json }));
        return { devices, push: typeof subscription === "string" ? subscription : "connected" };
    } catch {
        return { devices: null, push: "failed" };
    }
}

export const listDevices = async (client: ApiClient): Promise<Device[]> =>
    unwrapResponse(await client.api.push.devices.$get());

export const setDeviceEnabled = async (client: ApiClient, id: string, enabled: boolean): Promise<Device> =>
    unwrapResponse(await client.api.push.devices[":id"].$patch({ param: { id }, json: { enabled } }));

export const forgetDevice = async (client: ApiClient, id: string): Promise<void> => {
    await client.api.push.devices[":id"].$delete({ param: { id } }).catch(() => {});
};

/** Stops this device getting the account's reminders, and drops its push subscription here. */
export async function forgetThisDevice(client: ApiClient): Promise<void> {
    const id = installId();
    const subscription = await currentSubscription();
    if (subscription) await subscription.unsubscribe().catch(() => false);
    await forgetDevice(client, id);
}

/** Asks the server to push one test to this device. */
export async function sendServerTest(client: ApiClient): Promise<"accepted" | "gone" | "failed"> {
    try {
        return (await unwrapResponse(await client.api.push.test.$post({ json: { installId: installId() } }))).outcome;
    } catch {
        return "failed";
    }
}
