/**
 * The user's photo background: fetching it, uploading a new one, removing it.
 *
 * The photo lives in private storage and is only readable through an
 * authenticated request, so it is fetched as a blob, cached on the device, and
 * handed to the UI as an object URL. Colours are read from the compressed file
 * before upload, so the server never has to decode the image.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { parseApiError, unwrapResponse, type UnwrappableResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
    backgroundCacheGeneration,
    isBackgroundCacheCurrent,
    cacheBackgroundImage,
    clearCachedBackgroundImages,
    readCachedBackgroundImage,
} from "../../lib/themes/background-image-cache";
import { extractPhotoPalette } from "../../lib/themes/image-palette";
import { compressBackgroundImage, readImagePixels } from "../../lib/utils/image";
import { useSettingsCache } from "../core/use-settings";
import { useObjectUrl } from "./use-object-url";

async function unwrapImageResponse(response: UnwrappableResponse & { blob(): Promise<Blob> }): Promise<Blob> {
    if (!response.ok) throw await parseApiError(response);
    return response.blob();
}

/** The current photo as an object URL, or null while it loads or if there is none. */
export function useBackgroundImageUrl(imageId: string | null | undefined): string | null {
    const client = useApiClient();
    const { session, authReady, isAuthenticated } = useAuthState();
    const userId = session?.user.id;

    const { data } = useQuery({
        queryKey: queryKeys.appearance.backgroundImage(userId ?? null, imageId ?? null),
        enabled: Boolean(userId && imageId && authReady && isAuthenticated),
        staleTime: Infinity,
        gcTime: 0, // Release inactive blobs; IndexedDB handles reuse.
        // A Blob can't be dehydrated; the IndexedDB cache covers reloads instead.
        meta: { persist: false },
        queryFn: async ({ signal }) => {
            const generation = backgroundCacheGeneration();
            const cached = await readCachedBackgroundImage(userId!, imageId!);
            signal.throwIfAborted();
            if (!isBackgroundCacheCurrent(generation)) throw new DOMException("Session changed", "AbortError");
            if (cached) return cached;

            const response = await client.api.settings.background[":id"].$get({ param: { id: imageId! } }, { init: { signal } });
            const blob = await unwrapImageResponse(response as never);
            signal.throwIfAborted();
            await cacheBackgroundImage(userId!, imageId!, blob, generation);
            if (!isBackgroundCacheCurrent(generation)) throw new DOMException("Session changed", "AbortError");
            return blob;
        },
    });

    return useObjectUrl(data);
}

/** Compress, read colours from, and upload a new photo. Replaces any existing one. */
export function useUploadBackgroundImage() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const settingsCache = useSettingsCache();
    const { session } = useAuthState();
    const userId = session?.user.id;

    return useMutation({
        mutationFn: async (file: File) => {
            const generation = backgroundCacheGeneration();
            const compressed = await compressBackgroundImage(file);
            const { dominant, swatches } = extractPhotoPalette(await readImagePixels(compressed));
            if (!isBackgroundCacheCurrent(generation)) throw new Error("Session changed. Please choose your photo again.");
            const response = await client.api.settings.background.$post({
                form: { file: compressed, dominant, swatches: swatches.join(",") },
            });
            return { settings: await unwrapResponse(response), blob: compressed as Blob, generation };
        },
        onSuccess: async ({ settings, blob, generation }) => {
            if (!isBackgroundCacheCurrent(generation)) return;
            const image = settings.appearance?.backgroundImage;
            if (userId && image) {
                await cacheBackgroundImage(userId, image.id, blob, generation);
                if (!isBackgroundCacheCurrent(generation)) return;
                queryClient.setQueryData(queryKeys.appearance.backgroundImage(userId, image.id), blob);
            }
            settingsCache.write(settings);
        },
    });
}

/** Delete the stored photo and fall back to the theme background. */
export function useDeleteBackgroundImage() {
    const client = useApiClient();
    const settingsCache = useSettingsCache();
    const { session } = useAuthState();
    const userId = session?.user.id;

    return useMutation({
        mutationFn: async () => {
            const generation = backgroundCacheGeneration();
            const response = await client.api.settings.background.$delete();
            return { settings: await unwrapResponse(response), generation };
        },
        onMutate: () => {
            const previous = settingsCache.read();
            if (previous?.appearance) {
                settingsCache.write({
                    ...previous,
                    appearance: {
                        ...previous.appearance,
                        backgroundImage: null,
                        backgroundMode: previous.appearance.backgroundMode === "image"
                            ? "theme"
                            : previous.appearance.backgroundMode,
                    },
                });
            }
            return { previous, generation: backgroundCacheGeneration() };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous && isBackgroundCacheCurrent(context.generation)) settingsCache.write(context.previous);
        },
        onSuccess: ({ settings: updated, generation }) => {
            if (!isBackgroundCacheCurrent(generation)) return;
            settingsCache.write(updated);
            if (userId) void clearCachedBackgroundImages(userId);
        },
    });
}
