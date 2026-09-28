import { CADENCE_PUBLIC_VERSION } from "./constants/app-info";

/**
 * The app's one console logger.
 *
 *   debug · warn → dev only, with full detail (timings, recoveries, fallbacks)
 *   error        → always; in production one plain sentence plus the `errorRef`
 *                  a user can copy to support, never the raw error object
 *
 * Anything that breaks for the user is an `error`; everything else is dev-only.
 */

/**
 * `code · requestId · v0.22.0`, what a user copies when reporting a failure.
 * The requestId finds the matching backend `request_failed` line.
 */
export function errorRef(error: unknown): string {
    const { code, requestId } = (error ?? {}) as { code?: unknown; requestId?: unknown };
    const what = typeof code === "string"
        ? code
        : error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : "Error";
    return [what, typeof requestId === "string" && requestId, `v${CADENCE_PUBLIC_VERSION}`]
        .filter(Boolean)
        .join(" · ");
}

export const log = {
    debug(scope: string, message: string, ...details: unknown[]) {
        if (import.meta.env.DEV) console.debug(`[cadence:${scope}] ${message}`, ...details);
    },
    warn(scope: string, message: string, ...details: unknown[]) {
        if (import.meta.env.DEV) console.warn(`[cadence:${scope}] ${message}`, ...details);
    },
    error(scope: string, message: string, error?: unknown) {
        if (import.meta.env.DEV) console.error(`[cadence:${scope}] ${message}`, ...(error === undefined ? [] : [error]));
        else console.error(`Cadence: ${message} (${errorRef(error)})`);
    },
};
