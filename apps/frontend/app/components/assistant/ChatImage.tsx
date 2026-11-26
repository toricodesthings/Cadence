import { useState } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { FileText, ImageOff } from "lucide-react";
import { CHAT_PDF_MEDIA_TYPE } from "@cadence/contracts/ai";
import { useApiClient } from "../../hooks/auth/use-api-client";
import { useObjectUrl } from "../../hooks/ui/use-object-url";
import { parseApiError, type UnwrappableResponse } from "../../lib/api/helpers";
import type { ChatFileRef } from "../../lib/ai/messages";
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
 * Tapping one opens the message's photos in the shared `ImageViewer`. A PDF shows
 * as a chip that opens the file in a new tab (it has no name, like a photo).
 */
export function ChatImages({ files }: { files: ChatFileRef[] }) {
    const ids = files.map((f) => f.id);
    const client = useApiClient();
    const results = useQueries({
        queries: ids.map((id) => ({
            queryKey: queryKeys.ai.image(id),
            staleTime: Infinity,
            // A Blob can't be dehydrated into the persisted cache.
            meta: { persist: false },
            retry: (count: number, err: Error) => (err as unknown as ApiErrorResponse).status !== 404 && count < 2,
            queryFn: async ({ signal }: { signal: AbortSignal }) => {
                const response = (await client.api.ai.images[":id"].$get(
                    { param: { id } },
                    { init: { signal } },
                )) as unknown as UnwrappableResponse & {
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
            {results.map((result, i) =>
                files[i].mediaType === CHAT_PDF_MEDIA_TYPE ? (
                    <PdfChip key={ids[i]} result={result} />
                ) : (
                    <ChatThumb key={ids[i]} result={result} onOpen={() => setOpen(i)} />
                ),
            )}
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

function PdfChip({ result }: { result: UseQueryResult<Blob> }) {
    const chip =
        "flex h-10 items-center gap-2 rounded-2xl border border-white/[0.06] bg-panel-raised/60 px-3 text-[12px] text-twilight-text-soft";
    if (result.error) {
        const expired = (result.error as unknown as ApiErrorResponse).status === 404;
        return (
            <div className={`${chip} text-twilight-text-muted`}>
                <FileText size={15} aria-hidden />
                {expired ? "PDF expired" : "Couldn’t load PDF"}
            </div>
        );
    }
    return (
        <button
            type="button"
            disabled={!result.data}
            onClick={() => result.data && window.open(URL.createObjectURL(result.data), "_blank", "noopener")}
            className={`${chip} cursor-pointer hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50`}
            aria-label="Open PDF"
        >
            <FileText size={15} aria-hidden />
            PDF
        </button>
    );
}

function ChatThumb({ result, onOpen }: { result: UseQueryResult<Blob>; onOpen: () => void }) {
    const url = useObjectUrl(result.data);

    if (result.error) {
        const expired = (result.error as unknown as ApiErrorResponse).status === 404;
        return (
            <div className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-2xl border border-white/[0.06] bg-panel-raised/60 text-[11px] text-twilight-text-muted">
                <ImageOff size={16} aria-hidden />
                {expired ? "Photo expired" : "Couldn’t load photo"}
            </div>
        );
    }
    if (!url)
        return <div className="h-24 w-24 animate-pulse rounded-2xl bg-panel-raised/60" aria-label="Loading photo" />;
    return (
        <button
            type="button"
            onClick={onOpen}
            className="block cursor-zoom-in rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            aria-label="View photo full size"
        >
            <img
                src={url}
                alt={SENT_TITLE}
                className="block max-h-48 max-w-[200px] rounded-2xl object-cover ring-1 ring-white/10"
            />
        </button>
    );
}
