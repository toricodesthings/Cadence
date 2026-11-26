import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { refetchAfterWrites } from "../../lib/api/write-gate";
import { useRef, useCallback, useEffect, useMemo } from "react";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { UserSettings, DeepPartial } from "../../types/settings";
import { SETTINGS_DEFAULTS } from "../../types/settings";
import { useAuthState } from "../auth/use-auth-state";
import { deepMerge } from "@cadence/contracts/settings";

const SETTINGS_KEY = (userId: string | undefined) => ["settings", userId ?? "anonymous"] as const;
const registeredFlushers = new Set<() => Promise<void>>();

function getLocalSettingsKey(userId: string | undefined) {
    return userId ? `cadence_user_settings:${userId}` : null;
}

function readLocalCache(storageKey: string | null): Partial<UserSettings> | undefined {
    if (!storageKey) return undefined;
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        return deepMerge(SETTINGS_DEFAULTS, parsed);
    } catch {
        return undefined;
    }
}

function writeLocalCache(storageKey: string | null, settings: Partial<UserSettings>) {
    if (!storageKey) return;
    try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {}
}

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
            writeLocalCache(storageKey, data);
            return data;
        },
        initialData: () => readLocalCache(storageKey) as UserSettings | undefined,
        initialDataUpdatedAt: 0,
        staleTime: 60_000,
    });
}

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

    const pendingPatch = useRef<DeepPartial<UserSettings>>({});
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const mutation = useMutation({
        mutationFn: async (patch: DeepPartial<UserSettings>) => {
            const res = await client.api.settings.$patch({ json: patch });
            return unwrapResponse(res);
        },
        onSettled: () => {
            if (Object.keys(pendingPatch.current).length === 0) void refetchAfterWrites(queryClient, queryKey);
        },
    });

    const applyLocal = useCallback(
        (patch: DeepPartial<UserSettings>) => {
            const previous = queryClient.getQueryData<UserSettings>(queryKey);
            const next = deepMerge(previous || {}, patch);
            queryClient.setQueryData(queryKey, next);
            writeLocalCache(storageKey, next);
            return previous;
        },
        [queryClient, queryKey, storageKey],
    );

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

    const mutate = useCallback(
        (patch: DeepPartial<UserSettings>) => {
            applyLocal(patch);
            pendingPatch.current = deepMerge(pendingPatch.current, patch);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(() => mutation.mutate(takePending()), DEBOUNCE_MS);
        },
        [applyLocal, takePending, mutation],
    );

    const mutateAsync = useCallback(
        async (patch: DeepPartial<UserSettings>) => {
            const previous = applyLocal(patch);
            try {
                return await mutation.mutateAsync(deepMerge(takePending(), patch));
            } catch (err) {
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
