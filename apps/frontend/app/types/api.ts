// Envelope shapes are canonical in @cadence/contracts/common. The runtime error
// class below stays in the frontend (it is behavior, not a contract).
export type { ApiResponse, ApiError } from "@cadence/contracts/common";

export class ApiErrorResponse extends Error {
    status: number;
    code: string;
    isAuthError: boolean;
    isRetryable: boolean;
    details?: unknown;
    /** From a 429's `Retry-After`: how long the server wants us to wait. */
    retryAfterSeconds?: number;

    constructor({
        status,
        code,
        message,
        isRetryable = false,
        details,
        retryAfterSeconds,
    }: {
        status: number;
        code: string;
        message: string;
        isRetryable?: boolean;
        details?: unknown;
        retryAfterSeconds?: number;
    }) {
        super(message);
        this.name = "ApiErrorResponse";
        this.status = status;
        this.code = code;
        this.isAuthError = status === 401 || code === "UNAUTHORIZED" || code === "TOKEN_EXPIRED";
        this.isRetryable = isRetryable;
        this.details = details;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    get isRateLimited(): boolean {
        return this.status === 429 || this.code === "TOO_MANY_REQUESTS";
    }
}
