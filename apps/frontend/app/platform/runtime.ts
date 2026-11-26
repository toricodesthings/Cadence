import { RUNTIME_TARGET } from "../lib/env";

export type RuntimeTarget = "web" | "desktop";
export type NotificationPermissionState = "default" | "granted" | "denied";
export type SocialProvider = "google" | "github";

export interface AvailableAppUpdate {
    currentVersion: string;
    version: string;
    date?: string;
    body?: string;
    install: (onProgress?: (percent: number | null) => void) => Promise<void>;
}

export interface PlatformNotification {
    title: string;
    body?: string;
    icon?: string;
    route?: string;
    tag?: string;
}

export interface NativeStoreAdapter {
    get: <T>(key: string) => Promise<T | undefined>;
    set: (key: string, value: unknown) => Promise<void>;
    del: (key: string) => Promise<void>;
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
    getNativeStore: (storeName: string) => Promise<NativeStoreAdapter | null>;
    resizeWindow: (width: number, height: number, center?: boolean) => Promise<void>;
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

export function mergedCallbackParams(location: { search: string; hash: string }): URLSearchParams {
    const params = new URLSearchParams(location.search);
    const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    if (hash.includes("=")) {
        new URLSearchParams(hash).forEach((value, key) => {
            if (!params.has(key)) params.set(key, value);
        });
    }
    return params;
}

export function normalizeRedirectTo(value?: string | null): string {
    if (!value?.startsWith("/")) {
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

export function warmPlatformRuntime(): void {
    void loadPlatformRuntime();
}

const call = <K extends keyof PlatformRuntime>(key: K) =>
    (async (...args: unknown[]) =>
        ((await loadPlatformRuntime())[key] as (...a: unknown[]) => unknown)(...args)) as PlatformRuntime[K];

export const getNotificationPermission = call("getNotificationPermission");
export const requestNotificationPermission = call("requestNotificationPermission");
export const sendPlatformNotification = call("sendNotification");

export function getAuthCallbackUrl(redirectTo?: string): string {
    const target = normalizeRedirectTo(
        redirectTo ?? (typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`),
    );

    if (RUNTIME_TARGET === "desktop") {
        const params = new URLSearchParams({ redirectTo: target });
        return `cadence://auth/callback?${params.toString()}`;
    }

    const base =
        typeof window === "undefined"
            ? new URL("http://localhost/auth/callback")
            : new URL("/auth/callback", window.location.origin);

    base.searchParams.set("redirectTo", target);
    return base.toString();
}

export const getCurrentAuthCallback = call("getCurrentAuthCallback");
export const listenForAuthCallback = call("listenForAuthCallback");
export const beginSocialSignIn = call("beginSocialSignIn");
export const beginSocialLink = call("beginSocialLink");
export const openExternalUrl = call("openExternalUrl");
export const platformFetch = call("platformFetch");
export const checkForAppUpdate = call("checkForAppUpdate");
export const getNativeStore = call("getNativeStore");

export function hasDesktopWindow(): boolean {
    return IS_DESKTOP_RUNTIME && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getDesktopStore(storeName: string): Promise<NativeStoreAdapter | null> {
    if (!hasDesktopWindow()) return null;
    return getNativeStore(storeName).catch(() => null);
}

export function getWebStorage(): Storage | null {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined" ? window.localStorage : null;
}
