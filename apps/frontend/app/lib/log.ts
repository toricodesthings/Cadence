import { CADENCE_VERSION } from "./constants/app-info";
import type { ClientError } from "@cadence/contracts/events";

let errorReporter: ((error: unknown, kind: ClientError["kind"]) => void) | undefined;
export function setErrorReporter(reporter: typeof errorReporter) {
    errorReporter = reporter;
}
export function reportError(error: unknown, kind: ClientError["kind"]) {
    errorReporter?.(error, kind);
}

export function errorRef(error: unknown): string {
    const { code, requestId } = (error ?? {}) as { code?: unknown; requestId?: unknown };
    const what =
        typeof code === "string"
            ? code
            : error instanceof Error
              ? `${error.name}: ${error.message.slice(0, 120)}`
              : "Error";
    return [what, typeof requestId === "string" && requestId, `v${CADENCE_VERSION}`].filter(Boolean).join(" · ");
}

export const log = {
    debug(scope: string, message: string, ...details: unknown[]) {
        if (import.meta.env.DEV) console.debug(`[cadence:${scope}] ${message}`, ...details);
    },
    warn(scope: string, message: string, ...details: unknown[]) {
        if (import.meta.env.DEV) console.warn(`[cadence:${scope}] ${message}`, ...details);
    },
    error(scope: string, message: string, error?: unknown) {
        reportError(error, "action");
        if (import.meta.env.DEV)
            console.error(`[cadence:${scope}] ${message}`, ...(error === undefined ? [] : [error]));
        else console.error(`Cadence: ${message} (${errorRef(error)})`);
    },
};
