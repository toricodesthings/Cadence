import { ChevronLeft, ChevronRight, ImageOff, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../primitives/Dialog";

export type ViewerImage = {
    key: string;
    title: string;
    /** Null while it loads (or when it can't); only the shown image needs one. */
    src: string | null;
    bytes?: number;
    failed?: boolean;
};

export function formatBytes(bytes: number): string {
    return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

const NAV_BUTTON =
    "mobile-icon-button cursor-pointer rounded-full bg-twilight-surface text-twilight-text-soft ring-1 ring-white/10 transition-colors hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/**
 * Full-size photo viewer: title, size, and ← → through a set. Controlled by
 * `index` (null = closed); arrow keys step, and the set wraps around.
 */
export function ImageViewer({
    images,
    index,
    onIndexChange,
}: {
    images: ViewerImage[];
    index: number | null;
    onIndexChange: (index: number | null) => void;
}) {
    const current = index === null ? undefined : images[index];
    const count = images.length;
    const step = (delta: number) => {
        if (index !== null && count > 1) onIndexChange((index + delta + count) % count);
    };

    return (
        <Dialog open={current !== undefined} onOpenChange={(open) => !open && onIndexChange(null)}>
            <DialogContent
                hideCloseButton
                className="dialog-glow flex flex-col gap-3 p-4 sm:w-auto sm:min-w-[22rem] sm:max-w-[min(92vw,1100px)]"
                onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    step(event.key === "ArrowLeft" ? -1 : 1);
                }}
            >
                {current && index !== null ? (
                    <>
                        <div className="flex items-center gap-2.5 pl-1">
                            <DialogTitle className="min-w-0 flex-1 truncate text-[15px]">{current.title}</DialogTitle>
                            {current.bytes !== undefined ? (
                                <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-twilight-text-muted ring-1 ring-white/10">
                                    {formatBytes(current.bytes)}
                                </span>
                            ) : null}
                            <button type="button" onClick={() => onIndexChange(null)} className={NAV_BUTTON} aria-label="Close">
                                <X size={18} aria-hidden />
                            </button>
                        </div>

                        <div className="flex min-h-48 items-center justify-center">
                            {current.src ? (
                                <img
                                    key={current.key}
                                    src={current.src}
                                    alt={current.title}
                                    className="block max-h-[calc(100dvh-12rem)] max-w-full rounded-[20px] object-contain shadow-[0_24px_60px_-24px_color-mix(in_srgb,var(--accent-primary)_45%,transparent)] ring-1 ring-white/10"
                                />
                            ) : current.failed ? (
                                <span className="flex flex-col items-center gap-2 text-[12px] text-twilight-text-muted">
                                    <ImageOff size={20} aria-hidden />
                                    Couldn’t load this image
                                </span>
                            ) : (
                                <Loader2 size={20} className="animate-spin text-twilight-text-muted" aria-label="Loading image" />
                            )}
                        </div>

                        {count > 1 ? (
                            <div className="flex items-center justify-center gap-4">
                                <button type="button" onClick={() => step(-1)} className={NAV_BUTTON} aria-label="Previous image">
                                    <ChevronLeft size={18} aria-hidden />
                                </button>
                                <span className="min-w-12 text-center text-[12px] tabular-nums text-twilight-text-muted" aria-live="polite">
                                    {index + 1} of {count}
                                </span>
                                <button type="button" onClick={() => step(1)} className={NAV_BUTTON} aria-label="Next image">
                                    <ChevronRight size={18} aria-hidden />
                                </button>
                            </div>
                        ) : null}
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
