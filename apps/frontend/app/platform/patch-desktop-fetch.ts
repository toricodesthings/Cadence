import { NEON_AUTH_URL, RUNTIME_TARGET, WEB_APP_BASE_URL } from "../lib/env";
import { log } from "../lib/log";

if (
    RUNTIME_TARGET === "desktop" &&
    typeof window !== "undefined" &&
    Boolean((window as { isTauri?: unknown }).isTauri)
) {
    const NEON_AUTH_BASE = NEON_AUTH_URL.replace(/\/$/, "");
    const AUTH_ORIGIN = new URL(WEB_APP_BASE_URL).origin;
    const AUTH_REFERER = new URL("/", WEB_APP_BASE_URL).toString();
    const nativeFetch = window.fetch.bind(window);

    let tauriFetchFn: typeof fetch | null = null;
    const tauriFetchReady = import("@tauri-apps/plugin-http")
        .then((mod) => {
            tauriFetchFn = mod.fetch as typeof fetch;
        })
        .catch((err: unknown) => {
            log.error("desktop-fetch", "Couldn't load the desktop network layer, so sign-in may not work.", err);
        });

    window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        if (!url.startsWith(NEON_AUTH_BASE)) {
            return nativeFetch(input, init);
        }

        await tauriFetchReady;

        if (!tauriFetchFn) {
            log.warn("desktop-fetch", "Desktop auth transport unavailable");
            return nativeFetch(input, init);
        }

        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has("Origin")) headers.set("Origin", AUTH_ORIGIN);
        if (!headers.has("Referer")) headers.set("Referer", AUTH_REFERER);

        try {
            return await tauriFetchFn(input, { ...init, headers });
        } catch {
            log.warn("desktop-fetch", "Desktop auth transport failed");
            return nativeFetch(input, init);
        }
    } as typeof fetch;
}
