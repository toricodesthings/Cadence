/**
 * Targeted fetch interceptor for Neon Auth URLs on Desktop (Tauri).
 *
 * The `@neondatabase/auth` SDK's NeonAuthAdapterCore unconditionally overrides
 * `fetchOptions.customFetchImpl` with its own function that calls `fetch()`
 * directly. There is no configuration hook to inject a custom transport.
 *
 * On desktop, the WebView's native `fetch` is CORS-blocked for cross-origin
 * Neon Auth requests. This patch intercepts ONLY URLs that target the Neon Auth
 * endpoint and routes them through Tauri's OS-level HTTP client (which bypasses
 * CORS and maintains a persistent cookie jar). All other requests — React Router,
 * Vite HMR, API calls, etc. — pass through the browser's native fetch untouched.
 *
 * Import as a side-effect in root.tsx before the React tree mounts.
 */

import { isTauri } from "@tauri-apps/api/core";
import { NEON_AUTH_URL, RUNTIME_TARGET, WEB_APP_BASE_URL } from "../lib/env";

if (RUNTIME_TARGET === "desktop" && typeof window !== "undefined" && isTauri()) {
    const NEON_AUTH_BASE = NEON_AUTH_URL.replace(/\/$/, "");
    const AUTH_ORIGIN = new URL(WEB_APP_BASE_URL).origin;
    const AUTH_REFERER = new URL("/", WEB_APP_BASE_URL).toString();
    const nativeFetch = window.fetch.bind(window);

    // Eagerly start loading the Tauri HTTP module so it's ready when needed
    let tauriFetchFn: ((input: Request) => Promise<Response>) | null = null;
    const tauriFetchReady = import("@tauri-apps/plugin-http")
        .then((mod) => {
            tauriFetchFn = mod.fetch as (input: Request) => Promise<Response>;
        })
        .catch((err) => {
            console.error("[cadence:desktop-fetch] FAILED to load tauriFetch", err);
        });

    window.fetch = async function patchedFetch(
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> {
        const url = typeof input === "string"
            ? input
            : input instanceof URL
                ? input.href
                : input.url;

        // Only intercept Neon Auth requests; everything else stays native.
        if (!url.startsWith(NEON_AUTH_BASE)) {
            return nativeFetch(input, init);
        }

        await tauriFetchReady;

        if (!tauriFetchFn) {
            if (import.meta.env.DEV) {
                console.warn("[cadence:desktop-fetch] tauriFetch unavailable, falling back for:", url);
            }
            return nativeFetch(input, init);
        }

        // Inject Origin/Referer so the auth server accepts the request.
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has("Origin")) headers.set("Origin", AUTH_ORIGIN);
        if (!headers.has("Referer")) headers.set("Referer", AUTH_REFERER);

        const request = input instanceof Request
            ? new Request(input, { ...init, headers })
            : new Request(url, { ...init, headers });

        try {
            return await tauriFetchFn(request);
        } catch (err) {
            if (import.meta.env.DEV) {
                console.warn("[cadence:desktop-fetch] tauriFetch threw, falling back:", url, err);
            }
            return nativeFetch(input, init);
        }
    } as typeof fetch;
}

