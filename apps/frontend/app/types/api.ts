/** Standard API success envelope */
export interface ApiResponse<T> {
    data: T;
    meta?: { total?: number; limit?: number; offset?: number };
}

/** Standard API error envelope */
export interface ApiError {
    error: {
        code: string;
        message: string;
        status?: number;
        isRetryable?: boolean;
        details?: unknown;
    };
}

export class ApiErrorResponse extends Error {
    status: number;
    code: string;
    isAuthError: boolean;
    isRetryable: boolean;
    details?: unknown;

    constructor({
        status,
        code,
        message,
        isRetryable = false,
        details,
    }: {
        status: number;
        code: string;
        message: string;
        isRetryable?: boolean;
        details?: unknown;
    }) {
        super(message);
        this.name = "ApiErrorResponse";
        this.status = status;
        this.code = code;
        this.isAuthError = status === 401 || code === "UNAUTHORIZED" || code === "TOKEN_EXPIRED";
        this.isRetryable = isRetryable;
        this.details = details;
    }

    get isRateLimited(): boolean {
        return this.status === 429 || this.code === "TOO_MANY_REQUESTS";
    }
}
