import { ApiErrorResponse, type ApiError } from "../../types/api";

/**
 * Minimal response surface these helpers actually use. Both the DOM `Response`
 * and Hono RPC's `ClientResponse<…>` (which omits `webSocket`) satisfy it, so a
 * fully-typed `hc<AppType>` client can flow through without casts.
 */
export interface UnwrappableResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}

/** Extract a structured error message from a failed API response */
export async function parseApiError(response: UnwrappableResponse): Promise<ApiErrorResponse> {
    try {
        const body = (await response.json()) as ApiError;
        return new ApiErrorResponse({
            status: response.status,
            code: body.error?.code ?? "UNKNOWN_ERROR",
            message: body.error?.message ?? "An unexpected error occurred",
            isRetryable: body.error?.isRetryable ?? (response.status >= 500 || response.status === 429),
            details: body.error?.details,
        });
    } catch {
        return new ApiErrorResponse({
            status: response.status,
            code: "UNPARSEABLE_ERROR",
            message: `Request failed with status ${response.status}`,
            isRetryable: response.status >= 500 || response.status === 429,
        });
    }
}

/** Unwrap a successful API response, throwing on non-ok status */
export async function unwrapResponse<T>(response: UnwrappableResponse): Promise<T> {
    if (!response.ok) {
        throw await parseApiError(response);
    }
    const json = await response.json();
    return (json as { data: T }).data;
}
