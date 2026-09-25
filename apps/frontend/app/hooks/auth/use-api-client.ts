import { apiClient, type ApiClient } from "../../lib/api/client";

/** The typed RPC client, authenticated per request. A hook so tests can swap it. */
export function useApiClient(): ApiClient {
    return apiClient;
}
