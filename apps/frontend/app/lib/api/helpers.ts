import { ApiErrorResponse, type ApiError } from "../../types/api";

/**
 * Minimal response surface these helpers actually use. Both the DOM `Response`
 * and Hono RPC's `ClientResponse<…>` (which omits `webSocket`) satisfy it, so a
 * fully-typed `hc<AppType>` client can flow through without casts.
 */
export interface UnwrappableResponse {
    ok: boolean;
    status: number;
    headers?: Headers;
    json(): Promise<unknown>;
}

/** Extract a structured error message from a failed API response */
export async function parseApiError(response: UnwrappableResponse): Promise<ApiErrorResponse> {
    const retryAfter = Number(response.headers?.get("retry-after"));
    const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
    try {
        const body = (await response.json()) as ApiError;
        return new ApiErrorResponse({
            status: response.status,
            code: body.error?.code ?? "UNKNOWN_ERROR",
            message: body.error?.message ?? "An unexpected error occurred",
            isRetryable: body.error?.isRetryable ?? (response.status >= 500 || response.status === 429),
            requestId: body.error?.requestId,
            retryAfterSeconds,
        });
    } catch {
        return new ApiErrorResponse({
            status: response.status,
            code: "UNPARSEABLE_ERROR",
            message: `Request failed with status ${response.status}`,
            isRetryable: response.status >= 500 || response.status === 429,
            retryAfterSeconds,
        });
    }
}

/** The `data` of a route's success body, inferred from the RPC response type. */
export type ResponseData<R> = R extends { json(): Promise<infer B> } ? (B extends { data: infer D } ? D : never) : never;

/** Unwrap a successful API response, throwing on non-ok status. The type comes from the route. */
export async function unwrapResponse<R extends UnwrappableResponse>(response: R): Promise<ResponseData<R>> {
    if (!response.ok) {
        throw await parseApiError(response);
    }
    const json = await response.json();
    return (json as { data: ResponseData<R> }).data;
}
