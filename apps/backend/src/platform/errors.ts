import type { ApiError, ErrorCode } from "@cadence/contracts/common";
import { DomainError } from "@cadence/domain/errors";

export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: ErrorCode,
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
    // Compare instants, not strings: the API serves strict ISO, but a client may
    // send the same instant in another valid form (an offset, no milliseconds, or
    // a value cached before timestamps were unified). A naive !== would report a
    // false conflict.
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

type ErrorBodyOptions = Omit<ApiError["error"], "isRetryable"> & { isRetryable?: boolean };

export function createErrorBody(options: ErrorBodyOptions): ApiError {
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
