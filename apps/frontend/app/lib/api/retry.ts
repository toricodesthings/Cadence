import { ApiErrorResponse } from "../../types/api";
import { isUndone } from "../utils/undo-toast";

export function shouldRetry(failureCount: number, error: Error, maxRetries: number, retryRateLimited: boolean) {
    const undone: boolean = isUndone(error);
    if (undone) return false;
    if (!(error instanceof ApiErrorResponse)) return failureCount < maxRetries;
    if (error.isAuthError) return false;
    if (error.isRateLimited && !retryRateLimited) return false;
    return error.isRetryable && failureCount < maxRetries;
}
