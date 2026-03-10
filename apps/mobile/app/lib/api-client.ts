import { hc } from "hono/client";
import type { AppType } from "@cadence/backend";

// Export base URL for React Native Expo configuring for local network if testing physically
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8787";

export const createApiClient = (token?: string) => {
    return hc<AppType>(API_URL, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    }) as any;
};

export type ApiClient = ReturnType<typeof createApiClient>;
