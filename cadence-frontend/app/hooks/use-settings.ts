import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./use-api-client";
import { unwrapResponse } from "../lib/api/helpers";

export interface UserSettings {
    preferredView?: "list" | "kanban";
    [key: string]: unknown;
}

const SETTINGS_KEY = ["settings"] as const;

const LS_KEY = "cadence_user_settings";

/** Read settings from localStorage (fast cache) */
function readLocalCache(): UserSettings {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/** Write settings to localStorage */
function writeLocalCache(settings: UserSettings) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {
        // Silent fail if storage is full
    }
}

/**
 * Fetch user settings from the backend (with localStorage as initialData for instant load).
 */
export function useSettings() {
    const client = useApiClient();

    return useQuery({
        queryKey: SETTINGS_KEY,
        queryFn: async () => {
            const res = await client.api.settings.$get();
            const data = await unwrapResponse<UserSettings>(res);
            writeLocalCache(data); // sync to localStorage
            return data;
        },
        initialData: readLocalCache,
        staleTime: 60_000, // re-fetch at most once per minute
    });
}

/**
 * Update user settings. Optimistically updates cache + localStorage,
 * then persists to backend.
 */
export function useUpdateSettings() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (patch: Partial<UserSettings>) => {
            const res = await client.api.settings.$patch({ json: patch });
            return unwrapResponse<UserSettings>(res);
        },
        onMutate: async (patch) => {
            await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
            const previous = queryClient.getQueryData<UserSettings>(SETTINGS_KEY);

            const next = { ...previous, ...patch };
            queryClient.setQueryData(SETTINGS_KEY, next);
            writeLocalCache(next);

            return { previous };
        },
        onError: (_err, _patch, context) => {
            if (context?.previous !== undefined) {
                queryClient.setQueryData(SETTINGS_KEY, context.previous);
                writeLocalCache(context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
        },
    });
}
