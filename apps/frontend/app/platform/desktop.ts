import { invoke, isTauri } from "@tauri-apps/api/core";
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
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { redirectlessAuthClient } from "../lib/auth-client";
import { WEB_APP_BASE_URL } from "../lib/env";
import { log } from "../lib/log";
import {
    DESKTOP_AUTH_STATE_PARAM,
    prepareDesktopAuthHandoff,
} from "./desktop-auth-handoff";
import type {
    AvailableAppUpdate,
    NotificationPermissionState,
    SocialProvider,
} from "./runtime";
import { getAuthCallbackUrl } from "./runtime";

const OAUTH_CALLBACK_PORTS = [61827, 61828];

interface SingleInstancePayload {
    args: string[];
    cwd: string;
}

/** Static page served by the local OAuth listener (no React here): mirrors CardPage's logo + header, in the original warm palette. */
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
                --ease: cubic-bezier(0.16, 1, 0.3, 1);
            }

            * {
                box-sizing: border-box;
            }

            body {
                margin: 0;
                min-height: 100dvh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1.5rem 1rem;
                background:
                    radial-gradient(circle at top, rgba(245, 192, 111, 0.18), transparent 34%),
                    linear-gradient(180deg, #171327, #0d0a14);
            }

            main {
                position: relative;
                width: 100%;
                max-width: 32rem;
                padding: 1.5rem 1.25rem;
                border-radius: 1.75rem;
                background: rgba(23, 19, 39, 0.82);
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: 0 36px 120px rgba(0, 0, 0, 0.38);
                backdrop-filter: blur(24px);
                text-align: center;
                animation: card-in 0.6s var(--ease) both;
            }

            /* Diagonal light sweep along the border, same as the app's cards */
            main::after {
                content: "";
                position: absolute;
                inset: -1px;
                padding: 1px;
                border-radius: inherit;
                pointer-events: none;
                background: linear-gradient(135deg, transparent 44%, rgba(255, 247, 214, 0.08) 47%, rgba(255, 232, 168, 0.95) 50%, rgba(255, 247, 214, 0.08) 53%, transparent 56%) no-repeat;
                background-size: 300% 300%;
                mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
                animation: sheen 4.6s linear infinite;
            }

            img {
                display: block;
                width: 2.5rem;
                height: 2.5rem;
                margin: 0 auto 1rem;
                border-radius: 0.8rem;
                object-fit: cover;
                box-shadow: 0 8px 32px rgba(245, 192, 111, 0.22);
            }

            h1,
            p {
                animation: rise 0.5s var(--ease) both;
            }

            h1 {
                margin: 0;
                font-size: 1.45rem;
                font-weight: 600;
                line-height: 1.25;
                letter-spacing: -0.01em;
                text-wrap: balance;
                animation-delay: 0.14s;
            }

            p {
                margin: 0.5rem auto 0;
                max-width: 24rem;
                font-size: 0.875rem;
                line-height: 1.5rem;
                color: rgba(245, 239, 230, 0.78);
                text-wrap: pretty;
                animation-delay: 0.2s;
            }

            @keyframes card-in {
                from { opacity: 0; transform: translateY(16px) scale(0.98); }
            }

            @keyframes rise {
                from { opacity: 0; transform: translateY(10px); }
            }

            @keyframes sheen {
                0% { background-position: 100% 100%; opacity: 0.18; }
                50% { opacity: 0.9; }
                100% { background-position: 0% 0%; opacity: 0.18; }
            }

            @media (prefers-reduced-motion: reduce) {
                main,
                h1,
                p {
                    animation: none;
                }

                main::after {
                    animation: none;
                    background-position: 50% 50%;
                    opacity: 0.45;
                }
            }
        </style>
    </head>
    <body>
        <main>
            <img src="${WEB_APP_BASE_URL}/logo.png" alt="Cadence" onerror="this.remove()" />
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
    // Kept only while nobody is listening; a delivered callback must not be
    // replayed when the app remounts for the signed-in account.
    latestOauthCallback = oauthSubscribers.size === 0 ? callbackUrl : null;

    void stopOauthServer();

    oauthSubscribers.forEach((listener) => {
        listener(callbackUrl);
    });
    } catch {
    // Never log the URL or the parse error: both can carry the OAuth code.
    log.error("desktop-oauth", "Sign-in returned a link Cadence couldn't read.");
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
        onOauthInvalidUrl(() => {
        log.error("desktop-oauth", "Sign-in returned a link Cadence couldn't read.");
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

const restoredStores = new Set<string>();

export const desktopRuntime = {
    target: "desktop" as const,
    async getNotificationPermission(): Promise<NotificationPermissionState> {
        return (await isPermissionGranted()) ? "granted" : "default";
    },
    async requestNotificationPermission(): Promise<NotificationPermissionState> {
        return normalizeNotificationPermission(await requestPermission());
    },
    // The notification plugin answers "granted" without asking Windows, so permission here is a hint, not a check.
    async sendNotification(notification: { title: string; body?: string; icon?: string; route?: string; tag?: string }): Promise<void> {
        if (!hasTauriRuntime()) throw new Error("Desktop notifications need the Cadence app.");
        if (!(await isPermissionGranted())) throw new Error("Notifications aren't allowed.");

        // The plugin has no activation callback; a tap opens Cadence, not the reminder's page.
        sendDesktopNotification({ title: notification.title, body: notification.body, icon: notification.icon });
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

        const authState = await prepareDesktopAuthHandoff(target ?? "/");

        const port = await startOauthServer({
            ports: OAUTH_CALLBACK_PORTS,
            response: OAUTH_CALLBACK_SUCCESS_HTML,
        });
        oauthServerPort = port;

        const oauthCallbackUrl = new URL("/auth/callback", `http://localhost:${port}`);
        oauthCallbackUrl.searchParams.set("redirectTo", target ?? "/");
        oauthCallbackUrl.searchParams.set(DESKTOP_AUTH_STATE_PARAM, authState);
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

        const authState = await prepareDesktopAuthHandoff(target ?? "/");

        const port = await startOauthServer({
            ports: OAUTH_CALLBACK_PORTS,
            response: OAUTH_CALLBACK_SUCCESS_HTML,
        });
        oauthServerPort = port;

        const oauthCallbackUrl = new URL("/auth/callback", `http://localhost:${port}`);
        oauthCallbackUrl.searchParams.set("redirectTo", target ?? "/");
        oauthCallbackUrl.searchParams.set(DESKTOP_AUTH_STATE_PARAM, authState);
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

        try {
            return await tauriFetch(request);
        } catch (error) {
            const normalizedError = error instanceof Error
                ? error
                : new Error(typeof error === "string" ? error : JSON.stringify(error));

            log.warn("desktop-fetch", `native ${request.method} ${request.url} failed`, error);

            throw normalizedError;
        }
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
                // Download progress on the taskbar button; cleared on failure so it never sticks.
                const win = getCurrentWindow();
                let total = 0;
                let received = 0;
                try {
                    await update.downloadAndInstall((event) => {
                        if (event.event === "Started") total = event.data.contentLength ?? 0;
                        else if (event.event === "Progress") received += event.data.chunkLength;
                        const progress = total ? Math.min(100, Math.round((received / total) * 100)) : undefined;
                        void win.setProgressBar(progress === undefined
                            ? { status: ProgressBarStatus.Indeterminate }
                            : { status: ProgressBarStatus.Normal, progress }).catch(() => undefined);
                    });
                } catch (error) {
                    await win.setProgressBar({ status: ProgressBarStatus.None }).catch(() => undefined);
                    throw error;
                }
                await relaunch();
            },
        };
    },
    async getNativeStore(storeName: string) {
        if (!hasTauriRuntime()) {
            return null;
        }

        // A torn write leaves the file unreadable: restore the last good copy before the first load.
        // The query cache is rebuildable, so only protected stores pay for a snapshot after each save.
        if (!restoredStores.has(storeName)) {
            restoredStores.add(storeName);
            await invoke("store_restore_if_corrupt", { name: storeName }).catch(() => undefined);
        }
        const store = await loadStore(`${storeName}.dat`);
        const save = async () => {
            await store.save();
            if (storeName !== "cadence_cache") await invoke("store_snapshot", { name: storeName }).catch(() => undefined);
        };
        return {
            get: async <T>(key: string): Promise<T | undefined> => {
                return (await store.get<T>(key)) ?? undefined;
            },
            set: async (key: string, value: any): Promise<void> => {
                await store.set(key, value);
                await save();
            },
            del: async (key: string): Promise<void> => {
                await store.delete(key);
                await save();
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
