import type { ApiError, ApiIssue, ErrorCode } from "@cadence/contracts/common";
import { DomainError } from "@cadence/domain/errors";

export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: ErrorCode,
        message: string,
        public readonly isRetryable = false,
        public readonly issues?: ApiIssue[],
    ) {
        super(message);
    }
}

export function violatedUnique(error: unknown): string | undefined {
    const pg = ((error as { cause?: unknown }).cause ?? error) as {
        code?: string;
        constraint?: string;
        constraint_name?: string;
    };
    return pg.code === "23505" ? (pg.constraint_name ?? pg.constraint ?? "") : undefined;
}

export function throwIfNotFound<T>(value: T | null | undefined, label: string): asserts value is T {
    if (!value) throw new AppError(404, "NOT_FOUND", `${label} not found`);
}

export function assertNoConflict(expectedUpdatedAt: string | undefined, actualUpdatedAt: string, entity: string) {
    if (!expectedUpdatedAt) return;
    if (!sameVersion(expectedUpdatedAt, actualUpdatedAt)) {
        throw new AppError(409, "CONFLICT", `${entity} was modified by another client`);
    }
}

export function sameVersion(expectedUpdatedAt: string, actualUpdatedAt: string) {
    const expectedMs = new Date(expectedUpdatedAt).getTime();
    const actualMs = new Date(actualUpdatedAt).getTime();
    return !Number.isNaN(expectedMs) && !Number.isNaN(actualMs)
        ? expectedMs === actualMs
        : expectedUpdatedAt === actualUpdatedAt;
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
    const appError =
        error instanceof AppError
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
            issues: appError.issues,
        }),
        status: appError.statusCode,
        errorCode: appError.code,
    };
}
