import { RUNTIME_TARGET } from "../lib/env";

export type RuntimeTarget = "web" | "desktop";
export type NotificationPermissionState = "default" | "granted" | "denied";
export type SocialProvider = "google" | "github";

export interface AvailableAppUpdate {
    currentVersion: string;
    version: string;
    date?: string;
    body?: string;
    install: () => Promise<void>;
}

export interface PlatformNotification {
    title: string;
    body?: string;
    icon?: string;
    /** Same-origin path a tap opens. */
    route?: string;
    /** Notifications sharing a tag replace each other, so a local alert and a pushed one never stack. */
    tag?: string;
}

export interface NativeStoreAdapter {
    get: <T>(key: string) => Promise<T | undefined>;
    set: (key: string, value: any) => Promise<void>;
    del: (key: string) => Promise<void>;
}

interface PlatformRuntime {
    target: RuntimeTarget;
    getNotificationPermission: () => Promise<NotificationPermissionState>;
    requestNotificationPermission: () => Promise<NotificationPermissionState>;
    /** Resolves once the notification was handed to the browser/OS (not proof it was seen); throws if it could not be. */
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

/** Starts loading the platform adapter, so a later tap can call it without waiting on an import (a permission prompt must run inside the tap). */
export function warmPlatformRuntime(): void {
    void loadPlatformRuntime();
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

/** Opens a URL in the system browser (desktop) or a new tab (web). */
export async function openExternalUrl(url: string): Promise<void> {
    return (await loadPlatformRuntime()).openExternalUrl(url);
}

export async function platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return (await loadPlatformRuntime()).platformFetch(input, init);
}

export async function checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
    return (await loadPlatformRuntime()).checkForAppUpdate();
}

export async function getNativeStore(storeName: string): Promise<NativeStoreAdapter | null> {
    return (await loadPlatformRuntime()).getNativeStore(storeName);
}

/** True inside a Tauri window of the desktop build. */
export function hasDesktopWindow(): boolean {
    return IS_DESKTOP_RUNTIME && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The named native store inside a Tauri window; null otherwise or when it fails to load. */
export async function getDesktopStore(storeName: string): Promise<NativeStoreAdapter | null> {
    if (!hasDesktopWindow()) return null;
    return getNativeStore(storeName).catch(() => null);
}

/** `localStorage`, or null outside a browser. */
export function getWebStorage(): Storage | null {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined" ? window.localStorage : null;
}
