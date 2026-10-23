import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useCallback, useEffect, useMemo } from "react";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { UserSettings, DeepPartial } from "../../types/settings";
import { SETTINGS_DEFAULTS } from "../../types/settings";
import { useAuthState } from "../auth/use-auth-state";
import { deepMerge } from "@cadence/contracts/settings";

const SETTINGS_KEY = (userId: string | undefined) => ["settings", userId ?? "anonymous"] as const;
const registeredFlushers = new Set<() => Promise<void>>();

/** Read settings from localStorage (fast cache) */
function getLocalSettingsKey(userId: string | undefined) {
    return userId ? `cadence_user_settings:${userId}` : null;
}

function readLocalCache(storageKey: string | null): Partial<UserSettings> | undefined {
    if (!storageKey) return undefined;
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        // Merge with canonical defaults to ensure all keys exist
        return deepMerge(SETTINGS_DEFAULTS, parsed);
    } catch {
        return undefined;
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
            const data = await unwrapResponse(res);
            writeLocalCache(storageKey, data); // sync to localStorage
            return data;
        },
        initialData: () => readLocalCache(storageKey) as UserSettings | undefined,
        initialDataUpdatedAt: 0,
        staleTime: 60_000, // re-fetch at most once per minute
    });
}

/**
 * Read and write the settings cache directly (query cache + device cache).
 *
 * For flows that receive a complete settings payload from an endpoint other
 * than the debounced PATCH — the photo background upload and delete routes —
 * so their result lands everywhere `useSettings()` reads from.
 */
export function useSettingsCache() {
    const queryClient = useQueryClient();
    const { session } = useAuthState();
    const userId = session?.user.id;

    return useMemo(() => {
        const queryKey = SETTINGS_KEY(userId);
        const storageKey = getLocalSettingsKey(userId);
        return {
            read: () => queryClient.getQueryData<UserSettings>(queryKey),
            write: (settings: UserSettings) => {
                queryClient.setQueryData(queryKey, settings);
                writeLocalCache(storageKey, settings);
            },
        };
    }, [queryClient, userId]);
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
            return unwrapResponse(res);
        },
        onError: (_err, _patch) => {
            // On failure, re-fetch to restore the server state
            queryClient.invalidateQueries({ queryKey });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    /** Show `patch` at once (query cache + this device's copy); returns what was there before. */
    const applyLocal = useCallback((patch: DeepPartial<UserSettings>) => {
        const previous = queryClient.getQueryData<UserSettings>(queryKey);
        const next = deepMerge(previous || {}, patch);
        queryClient.setQueryData(queryKey, next);
        writeLocalCache(storageKey, next);
        return previous;
    }, [queryClient, queryKey, storageKey]);

    /** Everything waiting to be sent, with its debounce timer stopped. */
    const takePending = useCallback(() => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
        }
        const patch = pendingPatch.current;
        pendingPatch.current = {};
        return patch;
    }, []);

    const flushPending = useCallback(async () => {
        const patch = takePending();
        if (Object.keys(patch).length > 0) await mutation.mutateAsync(patch);
    }, [mutation, takePending]);

    /** Shows the change at once, then sends it with any others made within the debounce window. */
    const mutate = useCallback(
        (patch: DeepPartial<UserSettings>) => {
            applyLocal(patch);
            pendingPatch.current = deepMerge(pendingPatch.current, patch);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(() => mutation.mutate(takePending()), DEBOUNCE_MS);
        },
        [applyLocal, takePending, mutation],
    );

    /** Flush immediately without debounce (with anything pending) — returns a promise for await-style usage */
    const mutateAsync = useCallback(
        async (patch: DeepPartial<UserSettings>) => {
            const previous = applyLocal(patch);
            try {
                return await mutation.mutateAsync(deepMerge(takePending(), patch));
            } catch (err) {
                // Rollback optimistic update on failure
                if (previous) {
                    queryClient.setQueryData(queryKey, previous);
                    writeLocalCache(storageKey, previous);
                }
                throw err;
            }
        },
        [applyLocal, takePending, queryClient, queryKey, storageKey, mutation],
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
