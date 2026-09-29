import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { NEON_AUTH_URL } from "./env";

/**
 * On desktop, all Neon Auth fetch calls are intercepted by
 * platform/patch-desktop-fetch.ts which routes them through Tauri's
 * OS-level HTTP client. No custom fetch config is needed here.
 */

export const authClient = createAuthClient(NEON_AUTH_URL, {
    adapter: BetterAuthReactAdapter(),
});

export const redirectlessAuthClient = createAuthClient(NEON_AUTH_URL, {
    adapter: BetterAuthReactAdapter(),
});

/** Neon's client throws on a non-2xx instead of returning `{ error }`: resolves to the error either way, null on success. */
export function authError(call: Promise<{ error: unknown }>): Promise<{ message?: string } | null> {
    return call.then((res) => res.error as { message?: string } | null, (err: unknown) => err as { message?: string });
}
