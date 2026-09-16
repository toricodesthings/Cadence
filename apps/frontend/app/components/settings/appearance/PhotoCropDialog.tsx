import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Move, ZoomIn } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../primitives/Dialog";
import { Button } from "../../primitives/Button";
import { cropImage, loadCropSource, releaseCropSource, type CropSource } from "../../../lib/utils/image";
import { RangeSlider } from "./RangeSlider";

/** Backgrounds are cropped wide; the viewport crops further on very tall screens. */
const CROP_ASPECT = 16 / 9;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface PhotoCropDialogProps {
    /** The file someone just picked, or null when the dialog is closed. */
    file: File | null;
    /** True while the confirmed crop is being compressed and uploaded. */
    isUploading: boolean;
    onCancel: () => void;
    onConfirm: (cropped: File) => Promise<void>;
}

interface Size {
    width: number;
    height: number;
}

/**
 * Preview, pan and zoom a picked photo before anything is uploaded.
 *
 * Nothing leaves the device until "Set background" is pressed: the file is
 * decoded locally, and the confirmed crop is what gets compressed and sent.
 */
export function PhotoCropDialog({ file, isUploading, onCancel, onConfirm }: PhotoCropDialogProps) {
    const frameRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

    const [source, setSource] = useState<CropSource | null>(null);
    const [failed, setFailed] = useState(false);
    const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
    const [zoom, setZoom] = useState(MIN_ZOOM);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [cropping, setCropping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const confirming = useRef(false);
    const busy = cropping || isUploading;

    // Decode the picked file once, and release it when the dialog closes.
    useEffect(() => {
        if (!file) return;
        let active = true;
        let loaded: CropSource | null = null;

        setFailed(false);
        setZoom(MIN_ZOOM);
        setOffset({ x: 0, y: 0 });

        loadCropSource(file)
            .then((next) => {
                loaded = next;
                if (active) setSource(next);
                else releaseCropSource(next);
            })
            .catch(() => {
                if (active) setFailed(true);
            });

        return () => {
            active = false;
            setSource(null);
            if (loaded) releaseCropSource(loaded);
        };
    }, [file]);

    // The frame is fluid, so the geometry has to follow its measured width.
    useEffect(() => {
        const element = frameRef.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            const { width } = entry.contentRect;
            setFrame({ width, height: width / CROP_ASPECT });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [source]);

    // Scale that just covers the frame, before the zoom multiplier.
    const coverScale =
        source && frame.width > 0
            ? Math.max(frame.width / source.width, frame.height / source.height)
            : 1;
    const scale = coverScale * zoom;
    const displayWidth = (source?.width ?? 0) * scale;
    const displayHeight = (source?.height ?? 0) * scale;

    /** Keep the frame fully covered — the image can never be dragged off an edge. */
    const clamp = useCallback(
        (next: { x: number; y: number }, atScale: number) => {
            if (!source) return { x: 0, y: 0 };
            const maxX = Math.max(0, (source.width * atScale - frame.width) / 2);
            const maxY = Math.max(0, (source.height * atScale - frame.height) / 2);
            return {
                x: Math.min(maxX, Math.max(-maxX, next.x)),
                y: Math.min(maxY, Math.max(-maxY, next.y)),
            };
        },
        [source, frame.width, frame.height],
    );
    const position = clamp(offset, scale);

    const changeZoom = useCallback(
        (next: number) => {
            if (busy) return;
            const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
            setZoom(clampedZoom);
            // Zooming out can leave the image short of an edge; pull it back in.
            setOffset((current) => clamp(current, coverScale * clampedZoom));
        },
        [clamp, coverScale, busy],
    );

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!source || busy || dragRef.current || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: position.x,
            originY: position.y,
        };
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (busy || !drag || drag.pointerId !== event.pointerId) return;
        setOffset(
            clamp(
                {
                    x: drag.originX + (event.clientX - drag.startX),
                    y: drag.originY + (event.clientY - drag.startY),
                },
                scale,
            ),
        );
    };

    const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const handleConfirm = async () => {
        if (!source || frame.width === 0 || busy || confirming.current) return;
        confirming.current = true;
        setError(null);
        setCropping(true);
        try {
            const width = frame.width / scale;
            const height = frame.height / scale;
            const rect = {
                x: Math.min(Math.max(0, displayWidth / 2 - position.x - frame.width / 2) / scale, source.width - width),
                y: Math.min(Math.max(0, displayHeight / 2 - position.y - frame.height / 2) / scale, source.height - height),
                width,
                height,
            };
            await onConfirm(await cropImage(source, rect));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not set your background. Please try again.");
        } finally {
            confirming.current = false;
            setCropping(false);
        }
    };

    return (
        <Dialog open={file !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
            <DialogContent className="flex flex-col sm:max-w-xl [&>*]:shrink-0" hideCloseButton={busy}>
                <DialogHeader className="pr-6">
                    <DialogTitle>Position your background</DialogTitle>
                    <DialogDescription>
                        Drag to move, zoom to frame it. Nothing is uploaded until you confirm.
                    </DialogDescription>
                </DialogHeader>

                <div
                    ref={frameRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className="relative aspect-[16/9] w-full touch-none select-none overflow-hidden rounded-2xl bg-twilight-deep ring-1 ring-white/10"
                    style={{ cursor: source ? "grab" : "default" }}
                >
                    {source ? (
                        <img
                            src={source.url}
                            alt="Preview of your background crop"
                            draggable={false}
                            className="pointer-events-none absolute left-1/2 top-1/2"
                            style={{
                                width: displayWidth,
                                height: displayHeight,
                                maxWidth: "none",
                                transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)`,
                            }}
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-twilight-text-muted">
                            {failed ? (
                                "Cadence couldn't read that image."
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                    Opening your photo…
                                </span>
                            )}
                        </div>
                    )}

                    {/* Rule-of-thirds guides, so the frame reads as a crop. */}
                    {source && (
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
                            {Array.from({ length: 9 }, (_, cell) => (
                                <div key={cell} className="border border-white/15" />
                            ))}
                        </div>
                    )}

                    {busy && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                            <span className="flex items-center gap-2 text-[12px] font-medium text-white">
                                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                {isUploading ? "Uploading…" : "Preparing your photo…"}
                            </span>
                        </div>
                    )}
                </div>

                <fieldset disabled={!source || busy} className="flex min-w-0 flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <ZoomIn size={14} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
                        <RangeSlider
                            className="flex-1"
                            label="Zoom"
                            value={Math.round(zoom * 100)}
                            min={MIN_ZOOM * 100}
                            max={MAX_ZOOM * 100}
                            onChange={(value) => changeZoom(value / 100)}
                        />
                    </div>
                    {source && (["x", "y"] as const).map((axis) => {
                        const extent = Math.max(0, ((axis === "x" ? displayWidth - frame.width : displayHeight - frame.height)) / 2);
                        if (extent < 1) return null;
                        return (
                            <RangeSlider
                                key={axis}
                                label={axis === "x" ? "Horizontal position" : "Vertical position"}
                                value={Math.round((position[axis] / extent) * 100)}
                                min={-100}
                                max={100}
                                onChange={(value) => setOffset({ ...position, [axis]: value / 100 * extent })}
                            />
                        );
                    })}
                </fieldset>
                {error && <p role="alert" className="text-sm text-twilight-text">{error}</p>}

                <p className="flex items-center gap-1.5 text-[11px] text-twilight-text-muted">
                    <Move size={11} aria-hidden="true" />
                    Drag or use the position sliders. Tall screens may crop the sides further.
                </p>

                <DialogFooter className="gap-2">
                    <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleConfirm} disabled={!source || !frame.width || busy}>
                        Set background
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
