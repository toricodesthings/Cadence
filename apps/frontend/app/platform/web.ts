import { authClient } from "../lib/auth-client";
import type {
    AvailableAppUpdate,
    NotificationPermissionState,
    SocialProvider,
} from "./runtime";
import { getAuthCallbackUrl } from "./runtime";

function normalizeNotificationPermission(permission: string): NotificationPermissionState {
    if (permission === "granted" || permission === "denied") {
        return permission;
    }

    return "default";
}

export const webRuntime = {
    target: "web" as const,
    async getNotificationPermission(): Promise<NotificationPermissionState> {
        if (typeof window === "undefined" || !("Notification" in window)) {
            return "default";
        }

        return normalizeNotificationPermission(Notification.permission);
    },
    async requestNotificationPermission(): Promise<NotificationPermissionState> {
        if (typeof window === "undefined" || !("Notification" in window)) {
            return "denied";
        }

        return normalizeNotificationPermission(await Notification.requestPermission());
    },
    async sendNotification(notification: { title: string; body?: string; icon?: string }): Promise<void> {
        if (typeof window === "undefined" || !("Notification" in window)) {
            return;
        }

        if (Notification.permission !== "granted") {
            return;
        }

        const browserNotification = new Notification(notification.title, {
            body: notification.body,
            icon: notification.icon,
        });

        window.setTimeout(() => browserNotification.close(), 8_000);
    },
    async openExternalUrl(url: string): Promise<void> {
        if (typeof window === "undefined") {
            return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
    },
    getAuthCallbackUrl,
    async getCurrentAuthCallback(): Promise<URL | null> {
        if (typeof window === "undefined" || window.location.pathname !== "/auth/callback") {
            return null;
        }

        return new URL(window.location.href);
    },
    async listenForAuthCallback(): Promise<() => void> {
        return () => {};
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
    async checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
        return null;
    },
};
