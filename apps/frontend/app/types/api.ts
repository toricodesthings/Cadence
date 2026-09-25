// Envelope shapes are canonical in @cadence/contracts/common. The runtime error
// class below stays in the frontend (it is behavior, not a contract).
import type { ErrorCode } from "@cadence/contracts/common";

export type { ApiResponse, ApiError } from "@cadence/contracts/common";

/** A server code, or one the client makes when a response can't be read. */
export type ClientErrorCode = ErrorCode | "UNKNOWN_ERROR" | "UNPARSEABLE_ERROR";

export class ApiErrorResponse extends Error {
    status: number;
    code: ClientErrorCode;
    isAuthError: boolean;
    isRetryable: boolean;
    requestId?: string;
    /** From a 429's `Retry-After`: how long the server wants us to wait. */
    retryAfterSeconds?: number;

    constructor({
        status,
        code,
        message,
        isRetryable = false,
        requestId,
        retryAfterSeconds,
    }: {
        status: number;
        code: ClientErrorCode;
        message: string;
        isRetryable?: boolean;
        requestId?: string;
        retryAfterSeconds?: number;
    }) {
        super(message);
        this.name = "ApiErrorResponse";
        this.status = status;
        this.code = code;
        this.isAuthError = status === 401 || code === "UNAUTHORIZED" || code === "TOKEN_EXPIRED";
        this.isRetryable = isRetryable;
        this.requestId = requestId;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    get isRateLimited(): boolean {
        return this.status === 429 || this.code === "TOO_MANY_REQUESTS";
    }
}
