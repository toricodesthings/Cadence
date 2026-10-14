import { authClient } from "../lib/auth-client";
import type {
    AvailableAppUpdate,
    NotificationPermissionState,
    SocialProvider,
} from "./runtime";
import { getAuthCallbackUrl } from "./runtime";
import { readyRegistration } from "../lib/notifications/device-delivery";

function normalizeNotificationPermission(permission: string): NotificationPermissionState {
    if (permission === "granted" || permission === "denied") {
        return permission;
    }

    return "default";
}

export const webRuntime = {
    target: "web" as const,
    getNotificationPermission(): Promise<NotificationPermissionState> {
        if (typeof window === "undefined" || !("Notification" in window)) {
            return Promise.resolve("default");
        }

        return Promise.resolve(normalizeNotificationPermission(Notification.permission));
    },
    async requestNotificationPermission(): Promise<NotificationPermissionState> {
        if (typeof window === "undefined" || !("Notification" in window)) {
            return "denied";
        }

        return normalizeNotificationPermission(await Notification.requestPermission());
    },
    async sendNotification(notification: { title: string; body?: string; icon?: string; route?: string; tag?: string }): Promise<void> {
        if (typeof window === "undefined" || !("Notification" in window)) throw new Error("Notifications aren't supported here.");
        if (Notification.permission !== "granted") throw new Error("Notifications aren't allowed.");

        const options = { body: notification.body, icon: notification.icon, tag: notification.tag, data: { route: notification.route ?? "/" } };
        // Installed apps and phones only notify through the service worker (sw.js routes the tap).
        const registration = await readyRegistration(3_000);
        if (registration) {
            await registration.showNotification(notification.title, options);
            return;
        }

        // No worker (a dev build, a blocked worker): the constructor works on desktop browsers and throws elsewhere.
        const browserNotification = new Notification(notification.title, options);
        browserNotification.onclick = () => window.focus();
        window.setTimeout(() => browserNotification.close(), 8_000);
    },
    openExternalUrl(url: string): Promise<void> {
        if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
        return Promise.resolve();
    },
    getAuthCallbackUrl,
    getCurrentAuthCallback(): Promise<URL | null> {
        if (typeof window === "undefined" || window.location.pathname !== "/auth/callback") {
            return Promise.resolve(null);
        }

        return Promise.resolve(new URL(window.location.href));
    },
    listenForAuthCallback(): Promise<() => void> {
        return Promise.resolve(() => undefined);
    },
    async beginSocialSignIn(provider: SocialProvider, callbackURL?: string): Promise<void> {
        await authClient.signIn.social({
            provider,
            callbackURL: callbackURL ?? getAuthCallbackUrl(),
            fetchOptions: { throw: true },
        });
    },
    async beginSocialLink(provider: SocialProvider, callbackURL?: string): Promise<void> {
        await authClient.linkSocial({
            provider,
            callbackURL: callbackURL ?? getAuthCallbackUrl(),
            fetchOptions: { throw: true },
        });
    },
    async platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        return fetch(input, init);
    },
    checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
        return Promise.resolve(null);
    },
    getNativeStore() {
        return Promise.resolve(null);
    },
    async resizeWindow() {
        // No-op for web
    },
};
