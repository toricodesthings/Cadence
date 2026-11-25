import { ApiErrorResponse } from "../../types/api";
import { isUndone } from "../utils/undo-toast";

/** Whether a failed query or mutation tries again. Pressing Undo is never retried: that would re-run the write. */
export function shouldRetry(failureCount: number, error: Error, maxRetries: number, retryRateLimited: boolean) {
    // Not a type guard here: UndoneError is shaped like any Error, so narrowing would leave `never` below.
    const undone: boolean = isUndone(error);
    if (undone) return false;
    if (!(error instanceof ApiErrorResponse)) return failureCount < maxRetries;
    if (error.isAuthError) return false;
    if (error.isRateLimited && !retryRateLimited) return false;
    return error.isRetryable && failureCount < maxRetries;
}
