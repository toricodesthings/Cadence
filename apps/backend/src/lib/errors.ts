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
    if (expectedUpdatedAt && actualUpdatedAt !== expectedUpdatedAt) {
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
    if (error instanceof AppError) {
        return {
            body: createErrorBody({
                code: error.code,
                message: error.message,
                status: error.statusCode,
                isRetryable: error.isRetryable,
                requestId,
            }),
            status: error.statusCode,
            errorCode: error.code,
        };
    }

    return {
        body: createErrorBody({
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
            status: 500,
            isRetryable: true,
            requestId,
        }),
        status: 500,
        errorCode: "INTERNAL_ERROR",
    };
}
