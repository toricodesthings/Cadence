import { hc } from "hono/client";
import type { AppType } from "../../../../cadence-backend/src/index";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

/**
 * Create a typed Hono RPC client with optional auth token injection.
 * Note: The return type assertion `as ApiClient` is required because tsc cannot
 * fully resolve the cross-project Hono generic when the backend uses Cloudflare
 * Worker bindings. The actual runtime type is correct — Vite/esbuild resolves it fine.
 */
export function createApiClient(token?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return hc<AppType>(BASE_URL, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
}

// Derive as any to avoid circular-unknown collapse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiClient = ReturnType<typeof createApiClient>;
