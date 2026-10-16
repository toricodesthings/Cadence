import { useEffect, useRef, useState } from "react";
import { BusyOverlay } from "../../shared/BusyOverlay";
import Cropper, { type Area, type MediaSize, type Point, type Size } from "react-easy-crop";
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
/** The crop area is the whole frame, so it only needs a moonlit edge and today's faint thirds; the package's own colours stay hidden. */
const CROP_AREA = { border: "1px solid var(--color-moonlit-soft)", boxShadow: "none", color: "transparent" } as const;
const CROP_AREA_CLASS = "before:!border-white/15 after:!border-white/15 opacity-40";

interface PhotoCropDialogProps {
    /** The file someone just picked, or null when the dialog is closed. */
    file: File | null;
    /** True while the confirmed crop is being compressed and uploaded. */
    isUploading: boolean;
    onCancel: () => void;
    onConfirm: (cropped: File) => Promise<void>;
}

function StageNotice({ failed }: { failed: boolean }) {
    return (
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
    );
}

/**
 * Preview, pan and zoom a picked photo before anything is uploaded.
 *
 * Nothing leaves the device until "Set background" is pressed: the file is
 * decoded locally, and the confirmed crop is what gets compressed and sent.
 */
export function PhotoCropDialog({ file, isUploading, onCancel, onConfirm }: PhotoCropDialogProps) {
    const [source, setSource] = useState<CropSource | null>(null);
    const [failed, setFailed] = useState(false);
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(MIN_ZOOM);
    const [area, setArea] = useState<Area | null>(null);
    const [cropSize, setCropSize] = useState<Size | null>(null);
    const [media, setMedia] = useState<MediaSize | null>(null);
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
        setCrop({ x: 0, y: 0 });
        setArea(null);
        setMedia(null);

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

    const handleConfirm = async () => {
        if (!source || !area || busy || confirming.current) return;
        confirming.current = true;
        setError(null);
        setCropping(true);
        try {
            await onConfirm(await cropImage(source, area));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not set your background. Please try again.");
        } finally {
            confirming.current = false;
            setCropping(false);
        }
    };

    // How far the photo can slide on each axis before the frame would show an edge.
    const extentOf = (axis: "x" | "y") =>
        media && cropSize ? Math.max(0, ((axis === "x" ? media.width * zoom - cropSize.width : media.height * zoom - cropSize.height)) / 2) : 0;

    return (
        <Dialog open={file !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
            <DialogContent className="flex flex-col sm:max-w-xl [&>*]:shrink-0" hideCloseButton={busy}>
                <DialogHeader className="pr-6">
                    <DialogTitle>Position your background</DialogTitle>
                    <DialogDescription>
                        Drag to move, zoom to frame it. Nothing is uploaded until you confirm.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative aspect-[16/9] w-full touch-none select-none overflow-hidden rounded-2xl bg-twilight-deep ring-1 ring-white/10">
                    {source ? (
                        <Cropper
                            image={source.url}
                            aspect={CROP_ASPECT}
                            objectFit="cover"
                            crop={crop}
                            zoom={zoom}
                            minZoom={MIN_ZOOM}
                            maxZoom={MAX_ZOOM}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={(_, pixels) => setArea(pixels)}
                            onCropSizeChange={setCropSize}
                            onMediaLoaded={setMedia}
                            showGrid
                            mediaProps={{ alt: "Preview of your background crop", draggable: false }}
                            style={{ cropAreaStyle: CROP_AREA }}
                            classes={{ cropAreaClassName: CROP_AREA_CLASS }}
                        />
                    ) : (
                        <StageNotice failed={failed} />
                    )}

                    {busy && <BusyOverlay label={isUploading ? "Uploading…" : "Preparing your photo…"} />}
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
                            onChange={(value) => setZoom(value / 100)}
                        />
                    </div>
                    {source && (["x", "y"] as const).map((axis) => {
                        const extent = extentOf(axis);
                        if (extent < 1) return null;
                        return (
                            <RangeSlider
                                key={axis}
                                label={axis === "x" ? "Horizontal position" : "Vertical position"}
                                value={Math.round((crop[axis] / extent) * 100)}
                                min={-100}
                                max={100}
                                onChange={(value) => setCrop({ ...crop, [axis]: value / 100 * extent })}
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
                    <Button type="button" onClick={handleConfirm} disabled={!source || !area || busy}>
                        Set background
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
