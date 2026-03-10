import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./use-api-client";
import { unwrapResponse } from "../lib/api/helpers";
import type { UserSettings, DeepPartial } from "../lib/types/settings";
import { useAuthState } from "./use-auth-state";

const SETTINGS_KEY = (userId: string | undefined) => ["settings", userId ?? "anonymous"] as const;

/** Deep merges source into target for settings updates */
function isObject(item: any): item is Record<string, any> {
    return item && typeof item === "object" && !Array.isArray(item);
}

function deepMerge(target: any, source: any): any {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach((key) => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

/** Read settings from localStorage (fast cache) */
function getLocalSettingsKey(userId: string | undefined) {
    return userId ? `cadence_user_settings:${userId}` : null;
}

function readLocalCache(storageKey: string | null): Partial<UserSettings> {
    if (!storageKey) return {};
    try {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/** Write settings to localStorage */
function writeLocalCache(storageKey: string | null, settings: Partial<UserSettings>) {
    if (!storageKey) return;
    try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
        // Silent fail if storage is full
    }
}

/**
 * Fetch user settings from the backend (with localStorage as initialData for instant load).
 */
export function useSettings() {
    const client = useApiClient();
    const { authReady, isAuthenticated, session } = useAuthState();
    const storageKey = getLocalSettingsKey(session?.user.id);
    const queryKey = SETTINGS_KEY(session?.user.id);

    return useQuery({
        queryKey,
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.settings.$get();
            const data = await unwrapResponse<UserSettings>(res);
            writeLocalCache(storageKey, data); // sync to localStorage
            return data;
        },
        initialData: () => readLocalCache(storageKey) as UserSettings,
        initialDataUpdatedAt: 0,
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
    const { session } = useAuthState();
    const storageKey = getLocalSettingsKey(session?.user.id);
    const queryKey = SETTINGS_KEY(session?.user.id);

    return useMutation({
        mutationFn: async (patch: DeepPartial<UserSettings>) => {
            const res = await client.api.settings.$patch({ json: patch });
            return unwrapResponse<UserSettings>(res);
        },
        onMutate: async (patch) => {
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData<UserSettings>(queryKey);

            const next = deepMerge(previous || {}, patch);
            queryClient.setQueryData(queryKey, next);
            writeLocalCache(storageKey, next);

            return { previous };
        },
        onError: (_err, _patch, context) => {
            if (context?.previous !== undefined) {
                queryClient.setQueryData(queryKey, context.previous);
                writeLocalCache(storageKey, context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });
}
