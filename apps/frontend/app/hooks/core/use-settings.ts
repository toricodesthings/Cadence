import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useCallback, useEffect } from "react";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { UserSettings, DeepPartial } from "../../lib/types/settings";
import { SETTINGS_DEFAULTS } from "../../lib/types/settings";
import { useAuthState } from "../auth/use-auth-state";

const SETTINGS_KEY = (userId: string | undefined) => ["settings", userId ?? "anonymous"] as const;
const registeredFlushers = new Set<() => Promise<void>>();

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
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        // Merge with canonical defaults to ensure all keys exist
        return deepMerge(SETTINGS_DEFAULTS, parsed);
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
 * Update user settings. Optimistically updates cache + localStorage instantly,
 * then debounces the actual network PATCH to coalesce rapid changes.
 */
const DEBOUNCE_MS = 500;

export async function flushAllPendingSettingsMutations() {
    await Promise.all(Array.from(registeredFlushers, (flush) => flush()));
}

export function useUpdateSettings() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();
    const storageKey = getLocalSettingsKey(session?.user.id);
    const queryKey = SETTINGS_KEY(session?.user.id);

    // Accumulate patches between debounced flushes
    const pendingPatch = useRef<DeepPartial<UserSettings>>({});
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const mutation = useMutation({
        mutationFn: async (patch: DeepPartial<UserSettings>) => {
            const res = await client.api.settings.$patch({ json: patch });
            return unwrapResponse<UserSettings>(res);
        },
        onError: (_err, _patch) => {
            // On failure, re-fetch to restore the server state
            queryClient.invalidateQueries({ queryKey });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    const flushPending = useCallback(async () => {
        if (!pendingPatch.current || Object.keys(pendingPatch.current).length === 0) {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
                debounceTimer.current = null;
            }
            return;
        }

        const coalescedPatch = pendingPatch.current;
        pendingPatch.current = {};

        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
        }

        await mutation.mutateAsync(coalescedPatch);
    }, [mutation]);

    const mutate = useCallback(
        (patch: DeepPartial<UserSettings>) => {
            // 1. Optimistic: update cache + localStorage immediately
            const previous = queryClient.getQueryData<UserSettings>(queryKey);
            const next = deepMerge(previous || {}, patch);
            queryClient.setQueryData(queryKey, next);
            writeLocalCache(storageKey, next);

            // 2. Accumulate the patch
            pendingPatch.current = deepMerge(pendingPatch.current, patch);

            // 3. Debounce the network call
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(() => {
                const coalescedPatch = pendingPatch.current;
                pendingPatch.current = {};
                debounceTimer.current = null;
                mutation.mutate(coalescedPatch);
            }, DEBOUNCE_MS);
        },
        [queryClient, queryKey, storageKey, mutation],
    );

    /** Flush immediately without debounce — returns a promise for await-style usage */
    const mutateAsync = useCallback(
        async (patch: DeepPartial<UserSettings>) => {
            // Capture previous state for rollback
            const previous = queryClient.getQueryData<UserSettings>(queryKey);

            // Optimistic local update
            const next = deepMerge(previous || {}, patch);
            queryClient.setQueryData(queryKey, next);
            writeLocalCache(storageKey, next);

            // Flush any pending debounced patches together with this one
            const coalescedPatch = deepMerge(pendingPatch.current, patch);
            pendingPatch.current = {};
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
                debounceTimer.current = null;
            }

            try {
                return await mutation.mutateAsync(coalescedPatch);
            } catch (err) {
                // Rollback optimistic update on failure
                if (previous) {
                    queryClient.setQueryData(queryKey, previous);
                    writeLocalCache(storageKey, previous);
                }
                throw err;
            }
        },
        [queryClient, queryKey, storageKey, mutation],
    );

    useEffect(() => {
        registeredFlushers.add(flushPending);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                void flushPending();
            }
        };

        window.addEventListener("pagehide", handleVisibilityChange);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            registeredFlushers.delete(flushPending);
            window.removeEventListener("pagehide", handleVisibilityChange);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            void flushPending();
        };
    }, [flushPending]);

    return { mutate, mutateAsync, flushPending };
}
