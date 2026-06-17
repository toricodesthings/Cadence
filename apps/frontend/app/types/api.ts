// Envelope shapes are canonical in @cadence/contracts/common. The runtime error
// class below stays in the frontend (it is behavior, not a contract).
export type { ApiResponse, ApiError } from "@cadence/contracts/common";

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
