import type { ApiClient } from "../api/client";
import { unwrapResponse } from "../api/helpers";
import type { NotificationPermissionState } from "../../platform/runtime";

/**
 * What this device can do about reminders, in the one vocabulary Settings, the
 * notification center and the dispatcher share:
 * - unsupported: this browser can't show notifications at all
 * - install: an iPhone/iPad tab; push works only from the Home Screen app
 * - denied: the browser/OS blocks Cadence (only the person can undo that)
 * - off: not enabled on this device
 * - connected: the server pushes reminders here, even with Cadence closed
 * - local: Cadence shows reminders itself, only while it is running
 */
export type DeviceStatus = "unsupported" | "install" | "denied" | "off" | "connected" | "local";

export interface DeviceFacts {
    desktop: boolean;
    /** No Notification API (and not an iOS tab). */
    unsupported: boolean;
    iosTab: boolean;
    permission: NotificationPermissionState;
    /** The account has reminders on for devices (set the first time one is enabled). */
    accountOn: boolean;
    /** This device was turned off on purpose. */
    deviceOff: boolean;
    /** This browser's push subscription is saved on the server. */
    registered: boolean;
}

export function deviceStatus(f: DeviceFacts): DeviceStatus {
    if (f.iosTab) return "install";
    if (f.unsupported) return "unsupported";
    if (f.permission === "denied") return "denied";
    if (f.permission !== "granted" || !f.accountOn || f.deviceOff) return "off";
    return f.registered ? "connected" : "local";
}

const subscriptionKey = (userId: string) => `cadence_push_endpoint:${userId}`;
const DEVICE_OFF_KEY = "cadence_device_notifications_off";

function storage<T>(fn: (s: Storage) => T, fallback: T): T {
    try { return fn(window.localStorage); } catch { return fallback; }
}

export const readDeviceOff = () => typeof window !== "undefined" && storage((s) => s.getItem(DEVICE_OFF_KEY) === "1", false);
export const writeDeviceOff = (off: boolean) => storage((s) => (off ? s.setItem(DEVICE_OFF_KEY, "1") : s.removeItem(DEVICE_OFF_KEY)), undefined);

/** iPhone/iPad outside the installed Home Screen app: no push, no Notification API. */
export function isIosTab(): boolean {
    if (typeof navigator === "undefined") return false;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
    return ios && !standalone;
}

export const hasNotificationApi = () => typeof window !== "undefined" && "Notification" in window;
export const canPush = () => hasNotificationApi() && "serviceWorker" in navigator && "PushManager" in window;

const bytesOf = (text: string) => {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
};

/** The service worker registration, once active; null if there isn't one soon (dev builds, blocked workers). */
export async function readyRegistration(timeoutMs = 8_000): Promise<ServiceWorkerRegistration | null> {
    if (!("serviceWorker" in navigator)) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return Promise.race([navigator.serviceWorker.ready, timeout]).catch(() => null);
}

async function currentSubscription(): Promise<PushSubscription | null> {
    if (!canPush()) return null;
    const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    return (await registration?.pushManager.getSubscription().catch(() => null)) ?? null;
}

/** Whether this browser's subscription is the one the server has for this account. */
export async function isRegistered(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const subscription = await currentSubscription();
    return !!subscription && storage((s) => s.getItem(subscriptionKey(userId)) === subscription.endpoint, false);
}

export type RegisterResult = "connected" | "unavailable" | "failed";

/**
 * Subscribes this browser to Web Push and saves the subscription. Needs notification permission
 * already; never prompts. "unavailable" = the server has no push keys (or this browser has no
 * service worker), so reminders stay local. A saved subscription is the only thing that counts as connected.
 */
export async function registerThisDevice(client: ApiClient, userId: string): Promise<RegisterResult> {
    if (!canPush() || Notification.permission !== "granted") return "unavailable";
    try {
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
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const { endpoint, keys } = subscription.toJSON();
        if (!endpoint || !keys?.p256dh || !keys.auth) return "failed";
        await unwrapResponse(await client.api.push.subscription.$put({ json: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } }));
        storage((s) => s.setItem(subscriptionKey(userId), endpoint), undefined);
        return "connected";
    } catch {
        return "failed";
    }
}

/** Stops server delivery to this device (other devices keep theirs). The browser's subscription stays, so turning it back on is instant. */
export async function unregisterThisDevice(client: ApiClient, userId: string | undefined): Promise<void> {
    const subscription = await currentSubscription();
    if (userId) storage((s) => s.removeItem(subscriptionKey(userId)), undefined);
    if (subscription) await client.api.push.subscription.$delete({ json: { endpoint: subscription.endpoint } }).catch(() => {});
}

/** Asks the server to push one test to this device. */
export async function sendServerTest(client: ApiClient): Promise<"accepted" | "gone" | "failed"> {
    const subscription = await currentSubscription();
    if (!subscription) return "gone";
    try {
        return (await unwrapResponse(await client.api.push.test.$post({ json: { endpoint: subscription.endpoint } }))).outcome;
    } catch {
        return "failed";
    }
}
