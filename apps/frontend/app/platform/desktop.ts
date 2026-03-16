import { listen } from "@tauri-apps/api/event";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
    isPermissionGranted,
    requestPermission,
    sendNotification as sendDesktopNotification,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { redirectlessAuthClient } from "../lib/auth-client";
import type {
    AvailableAppUpdate,
    NotificationPermissionState,
    SocialProvider,
} from "./runtime";
import { getAuthCallbackUrl, getDesktopAuthBrowserStartUrl } from "./runtime";

interface SingleInstancePayload {
    args: string[];
    cwd: string;
}

function normalizeNotificationPermission(permission: string): NotificationPermissionState {
    if (permission === "granted" || permission === "denied") {
        return permission;
    }

    return "default";
}

function extractAuthRedirectUrl(result: unknown): string {
    const redirectUrl = (result as { data?: { url?: string } } | null)?.data?.url;

    if (!redirectUrl) {
        throw new Error("Neon Auth did not return an external redirect URL.");
    }

    return redirectUrl;
}

function firstCadenceUrl(urls: Iterable<string>): URL | null {
    for (const value of urls) {
        try {
            const url = new URL(value);
            if (url.protocol === "cadence:") {
                return url;
            }
        } catch {
            continue;
        }
    }

    return null;
}

export const desktopRuntime = {
    target: "desktop" as const,
    async getNotificationPermission(): Promise<NotificationPermissionState> {
        return (await isPermissionGranted()) ? "granted" : "default";
    },
    async requestNotificationPermission(): Promise<NotificationPermissionState> {
        return normalizeNotificationPermission(await requestPermission());
    },
    async sendNotification(notification: { title: string; body?: string; icon?: string }): Promise<void> {
        if (!(await isPermissionGranted())) {
            return;
        }

        sendDesktopNotification(notification);
    },
    async openExternalUrl(url: string): Promise<void> {
        await openUrl(url);
    },
    getAuthCallbackUrl,
    async getCurrentAuthCallback(): Promise<URL | null> {
        const current = await getCurrent();
        if (!current?.length) {
            return null;
        }

        return firstCadenceUrl(current);
    },
    async listenForAuthCallback(listener: (url: URL) => void): Promise<() => void> {
        const unlistenOpenUrl = await onOpenUrl((urls) => {
            const url = firstCadenceUrl(urls);
            if (url) {
                listener(url);
            }
        });

        const unlistenSingleInstance = await listen<SingleInstancePayload>("single-instance", (event) => {
            const url = firstCadenceUrl(event.payload.args);
            if (url) {
                listener(url);
            }
        });

        return () => {
            unlistenOpenUrl();
            unlistenSingleInstance();
        };
    },
    async beginSocialSignIn(provider: SocialProvider, callbackURL?: string): Promise<void> {
        const target = callbackURL
            ? new URL(callbackURL).searchParams.get("redirectTo")
            : undefined;
        await openUrl(getDesktopAuthBrowserStartUrl(provider, target ?? "/"));
    },
    async beginSocialLink(provider: SocialProvider, callbackURL?: string): Promise<void> {
        const authClientAny = redirectlessAuthClient as any;
        const result = await authClientAny.linkSocial({
            provider,
            callbackURL: callbackURL ?? getAuthCallbackUrl(),
            fetchOptions: { throw: true },
        });

        await openUrl(extractAuthRedirectUrl(result));
    },
    async platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
        return tauriFetch(request);
    },
    async checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
        const update = await check();

        if (!update) {
            return null;
        }

        return {
            currentVersion: update.currentVersion,
            version: update.version,
            date: update.date,
            body: update.body,
            install: async () => {
                await update.downloadAndInstall();
                await relaunch();
            },
        };
    },
};
