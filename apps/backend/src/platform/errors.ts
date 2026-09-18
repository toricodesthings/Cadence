import { DomainError } from "@cadence/domain/errors";

export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string,
        public readonly isRetryable = false,
    ) {
        super(message);
    }
}

export function throwIfNotFound<T>(value: T | null | undefined, label: string): asserts value is T {
    if (!value) throw new AppError(404, "NOT_FOUND", `${label} not found`);
}

export function assertNoConflict(expectedUpdatedAt: string | undefined, actualUpdatedAt: string, entity: string) {
    if (!expectedUpdatedAt) return;
    // Compare instants, not strings. Temporal columns are read as Postgres
    // timestamptz text ("2026-09-19 12:00:00+00") while the API serializes the
    // same column as strict ISO ("2026-09-19T12:00:00.000Z") — same instant,
    // different string. A naive !== would false-positive a conflict on the
    // client's next edit after it caches the serialized form.
    const expectedMs = new Date(expectedUpdatedAt).getTime();
    const actualMs = new Date(actualUpdatedAt).getTime();
    const sameInstant =
        !Number.isNaN(expectedMs) && !Number.isNaN(actualMs)
            ? expectedMs === actualMs
            : expectedUpdatedAt === actualUpdatedAt;
    if (!sameInstant) {
        throw new AppError(409, "CONFLICT", `${entity} was modified by another client`);
    }
}

type ErrorBodyOptions = {
    code: string;
    message: string;
    status: number;
    isRetryable?: boolean;
    requestId?: string;
    issues?: Array<{ code: string; message: string; path: string }>;
};

export function createErrorBody(options: ErrorBodyOptions) {
    return {
        error: {
            code: options.code,
            message: options.message,
            status: options.status,
            isRetryable: options.isRetryable ?? false,
            requestId: options.requestId,
            issues: options.issues,
        },
    };
}

export function formatErrorResponse(error: unknown, requestId?: string) {
    const appError = error instanceof AppError
        ? error
        : error instanceof DomainError
            ? new AppError(error.status, error.code, error.message)
            : new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred", true);

    return {
        body: createErrorBody({
            code: appError.code,
            message: appError.message,
            status: appError.statusCode,
            isRetryable: appError.isRetryable,
            requestId,
        }),
        status: appError.statusCode,
        errorCode: appError.code,
    };
}
