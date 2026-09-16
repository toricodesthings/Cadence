import { useState } from "react";
import { Check, Loader2, Lock, Sparkles, Trash2, Upload, Pipette } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";
import type { BackgroundImage } from "@cadence/contracts/settings";
import { cn } from "../../../lib/utils";
import * as AlertDialog from "../../primitives/AlertDialog";
import { Tip } from "../../primitives/Tooltip";
import { useDeleteBackgroundImage, useBackgroundImageUrl } from "../../../hooks/ui/use-background-image";
import { blurPixels } from "../../../lib/themes/image-palette";
import { RangeSlider } from "./RangeSlider";

interface PhotoBackgroundPanelProps {
    image: BackgroundImage;
    /** True while a confirmed crop is being compressed and uploaded. */
    uploading: boolean;
    /** Opens the crop dialog — with a dropped file, or the file browser when omitted. */
    onChoosePhoto: (file?: File) => void;
    onAdjust: (adjustments: Partial<Pick<BackgroundImage, "accent" | "blur" | "brightness">>) => void;
}

function AccentSwatch({
    color,
    label,
    selected,
    onSelect,
}: {
    color: string | null;
    label: string;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <Tip label={label} side="top">
            <button
                type="button"
                onClick={onSelect}
                aria-label={label}
                aria-pressed={selected}
                className={cn(
                    "relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                    "ring-1 ring-white/10 hover:ring-white/25",
                    selected && "ring-2 ring-[color:var(--accent-primary)]",
                )}
                style={color ? { background: color } : undefined}
            >
                {!color && <Sparkles size={13} className="text-twilight-text-soft" aria-hidden="true" />}
                {selected && color && <Check size={12} className="text-white drop-shadow-md" aria-hidden="true" />}
            </button>
        </Tip>
    );
}

export function PhotoBackgroundPanel({
    image,
    uploading,
    onChoosePhoto,
    onAdjust,
}: PhotoBackgroundPanelProps) {
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const remove = useDeleteBackgroundImage();
    const previewUrl = useBackgroundImageUrl(image.id);

    const privacyNote = (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-twilight-text-muted">
            <Lock size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
                Kept in private storage and shown only to you. Location and camera details are stripped before it
                leaves this device.{" "}
                <Link to="/privacy-policy" className="underline underline-offset-2 hover:text-twilight-text-soft">
                    How Cadence handles it
                </Link>
                .
            </span>
        </p>
    );

    // ── Stored photo ──
    const blur = blurPixels(image.blur);
    const swatches = image.swatches.slice(0, 6);

    return (
        <div className="flex flex-col gap-4">
            <div className="group relative overflow-hidden rounded-2xl ring-1 ring-white/10">
                <div className="relative aspect-[16/9] w-full bg-twilight-deep">
                    {previewUrl && (
                        <img
                            src={previewUrl}
                            alt="Your background"
                            className="absolute inset-0 h-full w-full object-cover"
                            style={{ filter: `blur(${blur / 3}px) brightness(${image.brightness}%)` }}
                        />
                    )}
                    {uploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                            <span className="flex items-center gap-2 text-[12px] font-medium text-white">
                                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                Preparing your photo…
                            </span>
                        </div>
                    )}

                    {/* Controls */}
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur-md">
                        <Tip label="Replace photo" side="top">
                            <button
                                type="button"
                                onClick={() => onChoosePhoto()}
                                aria-label="Replace photo"
                                disabled={uploading || remove.isPending}
                                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-50"
                            >
                                <Upload size={14} aria-hidden="true" />
                            </button>
                        </Tip>
                        <Tip label="Delete photo" side="top">
                            <button
                                type="button"
                                onClick={() => setConfirmingDelete(true)}
                                aria-label="Delete photo"
                                disabled={uploading || remove.isPending}
                                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white/90 transition-colors hover:bg-red-500/30 hover:text-white disabled:opacity-50"
                            >
                                <Trash2 size={14} aria-hidden="true" />
                            </button>
                        </Tip>
                    </div>

                    <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white">
                        In use
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-twilight-text-muted">
                    Photo accent
                </span>
                <div className="flex flex-wrap gap-2">
                    <AccentSwatch
                        color={null}
                        label="Pick automatically"
                        selected={image.accent === null}
                        onSelect={() => onAdjust({ accent: null })}
                    />
                    {swatches.map((swatch) => (
                        <AccentSwatch
                            key={swatch}
                            color={swatch}
                            label={`Use ${swatch}`}
                            selected={image.accent === swatch}
                            onSelect={() => onAdjust({ accent: swatch })}
                        />
                    ))}
                    <Tip label="Choose any accent color" side="top">
                        <label className={cn(
                            "relative flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-twilight-border-light focus-within:ring-2 focus-within:ring-accent-primary",
                            image.accent && !swatches.includes(image.accent) && "ring-2 ring-accent-primary",
                        )} style={image.accent && !swatches.includes(image.accent) ? { background: image.accent } : undefined}>
                            <span className="rounded bg-twilight-deep/90 p-1 text-twilight-text"><Pipette size={16} aria-hidden="true" /></span>
                            <input
                                type="color"
                                aria-label="Custom photo accent"
                                value={image.accent ?? image.swatches[0] ?? image.dominant}
                                onChange={(event) => onAdjust({ accent: event.target.value })}
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                        </label>
                    </Tip>
                </div>
                <p className="text-xs text-twilight-text-muted">Choose a color from your photo, or pick any color with the eyedropper. Cadence adjusts it for readable contrast.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <RangeSlider
                    label="Blur"
                    value={image.blur}
                    min={0}
                    max={100}
                    onChange={(blurValue) => onAdjust({ blur: blurValue })}
                />
                <RangeSlider
                    label="Brightness"
                    value={image.brightness}
                    min={20}
                    max={120}
                    onChange={(brightness) => onAdjust({ brightness })}
                />
            </div>

            {privacyNote}

            <AlertDialog.Root open={confirmingDelete} onOpenChange={setConfirmingDelete}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete this background?</AlertDialog.Title>
                        <AlertDialog.Description>
                            The photo is removed from Cadence's storage for good, and your background returns to
                            your theme.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel>Keep it</AlertDialog.Cancel>
                        <AlertDialog.Action
                            onClick={() =>
                                remove.mutate(undefined, {
                                    onSuccess: () => toast.success("Background deleted"),
                                    onError: () => toast.error("Couldn't delete that photo."),
                                })
                            }
                        >
                            Delete
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </div>
    );
}
