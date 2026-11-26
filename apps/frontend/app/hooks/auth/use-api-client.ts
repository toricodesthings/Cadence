import { apiClient, type ApiClient } from "../../lib/api/client";

export function useApiClient(): ApiClient {
    return apiClient;
}
