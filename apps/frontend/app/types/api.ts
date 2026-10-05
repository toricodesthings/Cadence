// Envelope shapes are canonical in @cadence/contracts/common. The runtime error
// class below stays in the frontend (it is behavior, not a contract).
import type { ClientErrorCode } from "@cadence/contracts/common";

export type { ApiResponse, ApiError, ClientErrorCode } from "@cadence/contracts/common";

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

export function networkError(message = "Can't reach Cadence right now"): ApiErrorResponse {
    return new ApiErrorResponse({ status: 0, code: "NETWORK_UNAVAILABLE", message, isRetryable: true });
}

/**
 * The request never reached the server (offline, weak signal, timeout, captive
 * portal): safe to queue and replay later. Never an auth failure.
 */
export function isNetworkFailure(error: unknown): boolean {
    if (error instanceof ApiErrorResponse) return error.code === "NETWORK_UNAVAILABLE";
    // fetch rejects with TypeError on a dropped connection; AbortSignal.timeout with TimeoutError.
    return error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError");
}
