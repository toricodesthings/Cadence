import { ApiErrorResponse, type ApiError } from "../../types/api";

/** Extract a structured error message from a failed API response */
export async function parseApiError(response: Response): Promise<ApiErrorResponse> {
    try {
        const body = (await response.json()) as ApiError;
        return new ApiErrorResponse({
            status: response.status,
            code: body.error?.code ?? "UNKNOWN_ERROR",
            message: body.error?.message ?? "An unexpected error occurred",
            isRetryable: body.error?.isRetryable ?? response.status >= 500,
            details: body.error?.details,
        });
    } catch {
        return new ApiErrorResponse({
            status: response.status,
            code: "UNPARSEABLE_ERROR",
            message: `Request failed with status ${response.status}`,
            isRetryable: response.status >= 500,
        });
    }
}

/** Unwrap a successful API response, throwing on non-ok status */
export async function unwrapResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        throw await parseApiError(response);
    }
    const json = await response.json();
    return (json as { data: T }).data;
}
