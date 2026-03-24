import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
    cancel as cancelOauthServer,
    onInvalidUrl as onOauthInvalidUrl,
    onUrl as onOauthUrl,
    start as startOauthServer,
} from "@fabianlars/tauri-plugin-oauth";
import {
    isPermissionGranted,
    requestPermission,
    sendNotification as sendDesktopNotification,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { load as loadStore } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { redirectlessAuthClient } from "../lib/auth-client";
import { WEB_APP_BASE_URL } from "../lib/env";
import type {
    AvailableAppUpdate,
    NotificationPermissionState,
    SocialProvider,
} from "./runtime";
import { getAuthCallbackUrl } from "./runtime";

interface SingleInstancePayload {
    args: string[];
    cwd: string;
}

const OAUTH_CALLBACK_SUCCESS_HTML = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Cadence</title>
        <style>
            :root {
                color-scheme: dark;
                font-family: Outfit, system-ui, sans-serif;
                background: #110f19;
                color: #f5efe6;
            }

            body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                background:
                    radial-gradient(circle at top, rgba(245, 192, 111, 0.18), transparent 34%),
                    linear-gradient(180deg, #171327, #0d0a14);
            }

            main {
                width: min(28rem, calc(100vw - 3rem));
                padding: 2rem;
                border-radius: 1.75rem;
                background: rgba(23, 19, 39, 0.82);
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
                text-align: center;
            }

            h1 {
                margin: 0 0 0.75rem;
                font-size: 1.5rem;
            }

            p {
                margin: 0;
                color: rgba(245, 239, 230, 0.78);
                line-height: 1.6;
            }
        </style>
    </head>
    <body>
        <main>
            <h1>Sign-in complete</h1>
            <p>Cadence received the secure callback. You can return to the desktop app.</p>
        </main>
    </body>
</html>`;

let oauthServerPort: number | null = null;
let oauthListenerReady: Promise<void> | null = null;
let latestOauthCallback: URL | null = null;
const oauthSubscribers = new Set<(url: URL) => void>();

function hasTauriRuntime() {
    return isTauri() && typeof window !== "undefined";
}

function getDesktopAuthRequestOrigin() {
    if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
        return window.location.origin;
    }

    return WEB_APP_BASE_URL;
}

async function stopOauthServer() {
    if (oauthServerPort === null) {
    return;
    }

    const activePort = oauthServerPort;
    oauthServerPort = null;

    await cancelOauthServer(activePort).catch(() => {
    // The plugin server exits after a successful callback, so cancel can race harmlessly.
    });
}

function publishOauthCallback(rawUrl: string) {
    try {
    const callbackUrl = new URL(rawUrl);
    latestOauthCallback = callbackUrl;

    void stopOauthServer();

    oauthSubscribers.forEach((listener) => {
        listener(callbackUrl);
    });
    } catch (error) {
    console.error("[cadence:desktop-oauth] received invalid callback URL", { rawUrl, error });
    }
}

async function ensureOauthListeners() {
    if (!hasTauriRuntime()) {
    return;
    }

    if (!oauthListenerReady) {
    oauthListenerReady = Promise.all([
        onOauthUrl((url) => {
        publishOauthCallback(url);
        }),
        onOauthInvalidUrl((error) => {
        console.error("[cadence:desktop-oauth] invalid localhost callback", error);
        }),
    ]).then(() => undefined);
    }

    await oauthListenerReady;
}

function normalizeNotificationPermission(permission: string): NotificationPermissionState {
    if (permission === "granted" || permission === "denied") {
        return permission;
    }

    return "default";
}

function extractAuthRedirectUrl(result: unknown): string {
    const obj = result as { data?: { url?: string }; url?: string } | null;
    const redirectUrl = obj?.data?.url ?? obj?.url;

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
        if (!hasTauriRuntime()) {
            return;
        }

        if (!(await isPermissionGranted())) {
            return;
        }

        sendDesktopNotification(notification);
    },
    async openExternalUrl(url: string): Promise<void> {
        if (!hasTauriRuntime()) {
            window.open(url, "_blank", "noopener,noreferrer");
            return;
        }

        await openUrl(url);
    },
    getAuthCallbackUrl,
    async getCurrentAuthCallback(): Promise<URL | null> {
        await ensureOauthListeners();

        if (latestOauthCallback) {
            const callbackUrl = latestOauthCallback;
            latestOauthCallback = null;
            return callbackUrl;
        }

        if (!hasTauriRuntime()) {
            return null;
        }

        const current = await getCurrent();
        if (!current?.length) {
            return null;
        }

        return firstCadenceUrl(current);
    },
    async listenForAuthCallback(listener: (url: URL) => void): Promise<() => void> {
        await ensureOauthListeners();

        oauthSubscribers.add(listener);

        if (!hasTauriRuntime()) {
            return () => {
                oauthSubscribers.delete(listener);
            };
        }

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
            oauthSubscribers.delete(listener);
            unlistenOpenUrl();
            unlistenSingleInstance();
        };
    },
    async beginSocialSignIn(provider: SocialProvider, callbackURL?: string): Promise<void> {
        if (!hasTauriRuntime()) {
            throw new Error("Desktop social sign-in requires the Tauri runtime.");
        }

        const target = callbackURL
            ? new URL(callbackURL).searchParams.get("redirectTo")
            : undefined;
        await ensureOauthListeners();
        await stopOauthServer();

        const port = await startOauthServer({ response: OAUTH_CALLBACK_SUCCESS_HTML });
        oauthServerPort = port;

        const oauthCallbackUrl = new URL("/auth/callback", `http://localhost:${port}`);
        oauthCallbackUrl.searchParams.set("redirectTo", target ?? "/");
        const origin = getDesktopAuthRequestOrigin();

        const authClientAny = redirectlessAuthClient as any;
        const result = await authClientAny.signIn.social({
            provider,
            callbackURL: oauthCallbackUrl.toString(),
            disableRedirect: true,
            fetchOptions: {
                throw: true,
                headers: {
                    origin,
                },
            },
        });

        const redirectUrl = extractAuthRedirectUrl(result);

        await openUrl(redirectUrl);
    },
    async beginSocialLink(provider: SocialProvider, callbackURL?: string): Promise<void> {
        if (!hasTauriRuntime()) {
            throw new Error("Desktop social linking requires the Tauri runtime.");
        }

        const target = callbackURL
            ? new URL(callbackURL).searchParams.get("redirectTo")
            : undefined;
        await ensureOauthListeners();
        await stopOauthServer();

        const port = await startOauthServer({ response: OAUTH_CALLBACK_SUCCESS_HTML });
        oauthServerPort = port;

        const oauthCallbackUrl = new URL("/auth/callback", `http://localhost:${port}`);
        oauthCallbackUrl.searchParams.set("redirectTo", target ?? "/");
        const origin = getDesktopAuthRequestOrigin();
        const authClientAny = redirectlessAuthClient as any;
        const result = await authClientAny.linkSocial({
            provider,
            callbackURL: oauthCallbackUrl.toString(),
            disableRedirect: true,
            fetchOptions: {
                throw: true,
                headers: {
                    origin,
                },
            },
        });

        await openUrl(extractAuthRedirectUrl(result));
    },
    async platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        if (!hasTauriRuntime()) {
            return fetch(input, init);
        }

        const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
        return tauriFetch(request);
    },
    async checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
        if (!hasTauriRuntime()) {
            return null;
        }

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
    async getNativeStore(storeName: string) {
        if (!hasTauriRuntime()) {
            return null;
        }

        const store = await loadStore(`${storeName}.dat`);
        return {
            get: async <T>(key: string): Promise<T | undefined> => {
                return (await store.get<T>(key)) ?? undefined;
            },
            set: async (key: string, value: any): Promise<void> => {
                await store.set(key, value);
                await store.save();
            },
            del: async (key: string): Promise<void> => {
                await store.delete(key);
                await store.save();
            }
        };
    },
    async resizeWindow(width: number, height: number, center?: boolean) {
        if (!hasTauriRuntime()) {
            return;
        }

        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(width, height));
        if (center) {
            await win.center();
        }
    },
};
