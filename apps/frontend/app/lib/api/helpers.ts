import { ApiErrorResponse, type ApiError } from "../../types/api";

export interface UnwrappableResponse {
    ok: boolean;
    status: number;
    headers?: Headers;
    json(): Promise<unknown>;
}

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
            issues: body.error?.issues,
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

export type ResponseData<R> = R extends { json(): Promise<infer B> }
    ? B extends { data: infer D }
        ? D
        : never
    : never;

export async function unwrapResponse<R extends UnwrappableResponse>(response: R): Promise<ResponseData<R>> {
    if (!response.ok) {
        throw await parseApiError(response);
    }
    const json = await response.json();
    return (json as { data: ResponseData<R> }).data;
}
