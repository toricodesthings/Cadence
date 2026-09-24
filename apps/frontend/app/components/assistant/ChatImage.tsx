import { useState } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useApiClient } from "../../hooks/auth/use-api-client";
import { useObjectUrl } from "../../hooks/ui/use-object-url";
import { parseApiError, type UnwrappableResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { ApiErrorResponse } from "../../types/api";
import { ImageViewer } from "../shared/ImageViewer";

/** Filenames never leave the device, so a sent photo has no name of its own. */
const SENT_TITLE = "Photo you sent";

/**
 * The photos a user sent, in their bubble. Chat images live in private storage,
 * so they're fetched through the authenticated API as blobs (a just-sent image
 * is seeded into the same cache entry, so it never downloads). Ids never change,
 * so a fetched blob never goes stale. Expired images show a quiet tile.
 * Tapping one opens the message's photos in the shared `ImageViewer`.
 */
export function ChatImages({ ids }: { ids: string[] }) {
    const client = useApiClient();
    const results = useQueries({
        queries: ids.map((id) => ({
            queryKey: queryKeys.ai.image(id),
            staleTime: Infinity,
            // A Blob can't be dehydrated into the persisted cache.
            meta: { persist: false },
            retry: (count: number, err: Error) => (err as unknown as ApiErrorResponse).status !== 404 && count < 2,
            queryFn: async ({ signal }: { signal: AbortSignal }) => {
                const response = (await client.api.ai.images[":id"].$get({ param: { id } }, { init: { signal } })) as unknown as UnwrappableResponse & {
                    blob(): Promise<Blob>;
                };
                if (!response.ok) throw await parseApiError(response);
                return response.blob();
            },
        })),
    });
    const [open, setOpen] = useState<number | null>(null);
    const openUrl = useObjectUrl(open === null ? null : results[open]?.data);

    return (
        <div className="flex flex-wrap justify-end gap-1.5">
            {results.map((result, i) => (
                <ChatThumb key={ids[i]} result={result} onOpen={() => setOpen(i)} />
            ))}
            <ImageViewer
                images={results.map((result, i) => ({
                    key: ids[i],
                    title: SENT_TITLE,
                    src: i === open ? openUrl : null,
                    bytes: result.data?.size,
                    failed: result.isError,
                }))}
                index={open}
                onIndexChange={setOpen}
            />
        </div>
    );
}

function ChatThumb({ result, onOpen }: { result: UseQueryResult<Blob>; onOpen: () => void }) {
    const url = useObjectUrl(result.data);

    if (result.error) {
        const expired = (result.error as unknown as ApiErrorResponse).status === 404;
        return (
            <div className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-2xl border border-white/[0.06] bg-panel-raised/60 text-[11px] text-twilight-text-muted">
                <ImageOff size={16} aria-hidden />
                {expired ? "Image expired" : "Couldn’t load image"}
            </div>
        );
    }
    if (!url) return <div className="h-24 w-24 animate-pulse rounded-2xl bg-panel-raised/60" aria-label="Loading image" />;
    return (
        <button
            type="button"
            onClick={onOpen}
            className="block cursor-zoom-in rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            aria-label="View image full size"
        >
            <img src={url} alt={SENT_TITLE} className="block max-h-48 max-w-[200px] rounded-2xl object-cover ring-1 ring-white/10" />
        </button>
    );
}
