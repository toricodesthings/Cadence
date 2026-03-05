import type { ApiError } from "../../types/api";

/** Extract a structured error message from a failed API response */
export async function parseApiError(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as ApiError;
        return body.error?.message ?? "An unexpected error occurred";
    } catch {
        return `Request failed with status ${response.status}`;
    }
}

/** Unwrap a successful API response, throwing on non-ok status */
export async function unwrapResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const message = await parseApiError(response);
        throw new Error(message);
    }
    const json = await response.json();
    return (json as { data: T }).data;
}
