import { RUNTIME_TARGET, WEB_APP_BASE_URL } from "../lib/env";

export type RuntimeTarget = "web" | "desktop";
export type NotificationPermissionState = "default" | "granted" | "denied";
export type SocialProvider = "google" | "github";
export const DESKTOP_AUTH_BRIDGE_PARAM = "desktopBridge";
export const DESKTOP_AUTH_PROVIDER_PARAM = "desktopProvider";

export interface AvailableAppUpdate {
    currentVersion: string;
    version: string;
    date?: string;
    body?: string;
    install: () => Promise<void>;
}

interface PlatformNotification {
    title: string;
    body?: string;
    icon?: string;
}

interface PlatformRuntime {
    target: RuntimeTarget;
    getNotificationPermission: () => Promise<NotificationPermissionState>;
    requestNotificationPermission: () => Promise<NotificationPermissionState>;
    sendNotification: (notification: PlatformNotification) => Promise<void>;
    openExternalUrl: (url: string) => Promise<void>;
    getAuthCallbackUrl: (redirectTo?: string) => string;
    getCurrentAuthCallback: () => Promise<URL | null>;
    listenForAuthCallback: (listener: (url: URL) => void) => Promise<() => void>;
    beginSocialSignIn: (provider: SocialProvider, callbackURL?: string) => Promise<void>;
    beginSocialLink: (provider: SocialProvider, callbackURL?: string) => Promise<void>;
    platformFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    checkForAppUpdate: () => Promise<AvailableAppUpdate | null>;
}

const loadPlatformRuntime = (() => {
    let runtimePromise: Promise<PlatformRuntime> | null = null;

    return () => {
        if (!runtimePromise) {
            runtimePromise = (
                RUNTIME_TARGET === "desktop"
                    ? import("./desktop").then((module) => module.desktopRuntime)
                    : import("./web").then((module) => module.webRuntime)
            ) as Promise<PlatformRuntime>;
        }

        return runtimePromise;
    };
})();

export const IS_DESKTOP_RUNTIME = RUNTIME_TARGET === "desktop";

export function normalizeRedirectTo(value?: string | null): string {
    if (!value || !value.startsWith("/")) {
        return "/";
    }

    if (value.startsWith("//")) {
        return "/";
    }

    try {
        const normalized = new URL(value, "http://cadence.local");
        if (normalized.origin !== "http://cadence.local") {
            return "/";
        }

        return `${normalized.pathname}${normalized.search}${normalized.hash}` || "/";
    } catch {
        return "/";
    }
}

export async function getNotificationPermission(): Promise<NotificationPermissionState> {
    return (await loadPlatformRuntime()).getNotificationPermission();
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
    return (await loadPlatformRuntime()).requestNotificationPermission();
}

export async function sendPlatformNotification(notification: PlatformNotification): Promise<void> {
    return (await loadPlatformRuntime()).sendNotification(notification);
}

export async function openExternalUrl(url: string): Promise<void> {
    return (await loadPlatformRuntime()).openExternalUrl(url);
}

export function getAuthCallbackUrl(redirectTo?: string): string {
    const target = normalizeRedirectTo(redirectTo ?? (typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`));

    if (RUNTIME_TARGET === "desktop") {
        const params = new URLSearchParams({ redirectTo: target });
        return `cadence://auth/callback?${params.toString()}`;
    }

    const base = typeof window === "undefined"
        ? new URL("http://localhost/auth/callback")
        : new URL("/auth/callback", window.location.origin);

    base.searchParams.set("redirectTo", target);
    return base.toString();
}

export function getDesktopAuthBrowserStartUrl(provider: SocialProvider, redirectTo?: string): string {
    const target = normalizeRedirectTo(redirectTo ?? "/");
    const url = new URL("/auth/desktop-start", WEB_APP_BASE_URL);
    url.searchParams.set(DESKTOP_AUTH_BRIDGE_PARAM, "1");
    url.searchParams.set(DESKTOP_AUTH_PROVIDER_PARAM, provider);
    url.searchParams.set("redirectTo", target);
    return url.toString();
}

export function getDesktopAuthBrowserCallbackPath(redirectTo?: string): string {
    const params = new URLSearchParams();
    params.set(DESKTOP_AUTH_BRIDGE_PARAM, "1");
    params.set("redirectTo", normalizeRedirectTo(redirectTo ?? "/"));
    return `/auth/callback?${params.toString()}`;
}

export function getDesktopDeepLinkCallbackUrl(params: URLSearchParams): string {
    const nextParams = new URLSearchParams(params);
    nextParams.delete(DESKTOP_AUTH_BRIDGE_PARAM);
    nextParams.delete(DESKTOP_AUTH_PROVIDER_PARAM);
    nextParams.set("redirectTo", normalizeRedirectTo(nextParams.get("redirectTo")));
    return `cadence://auth/callback?${nextParams.toString()}`;
}

export async function getCurrentAuthCallback(): Promise<URL | null> {
    return (await loadPlatformRuntime()).getCurrentAuthCallback();
}

export async function listenForAuthCallback(listener: (url: URL) => void): Promise<() => void> {
    return (await loadPlatformRuntime()).listenForAuthCallback(listener);
}

export async function beginSocialSignIn(provider: SocialProvider, callbackURL?: string): Promise<void> {
    return (await loadPlatformRuntime()).beginSocialSignIn(provider, callbackURL);
}

export async function beginSocialLink(provider: SocialProvider, callbackURL?: string): Promise<void> {
    return (await loadPlatformRuntime()).beginSocialLink(provider, callbackURL);
}

export async function platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return (await loadPlatformRuntime()).platformFetch(input, init);
}

export async function checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
    return (await loadPlatformRuntime()).checkForAppUpdate();
}
