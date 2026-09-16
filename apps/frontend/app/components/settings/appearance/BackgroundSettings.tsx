import { useRef, useState } from "react";
import { Check, Image, Palette, Plus } from "lucide-react";
import { toast } from "sonner";
import type { BackgroundImage } from "@cadence/contracts/settings";
import { cn } from "../../../lib/utils";
import { PhotoBackgroundPanel } from "./PhotoBackgroundPanel";
import { PhotoCropDialog } from "./PhotoCropDialog";
import { useUploadBackgroundImage } from "../../../hooks/ui/use-background-image";
import { THEME_PRESET_MAP, type ThemePresetId } from "../../../lib/themes/theme-presets";
import { GRADIENT_PRESETS, type GradientPreset } from "../../../lib/themes/gradient-presets";

type BackgroundMode = "theme" | "custom" | "image";

interface BackgroundSettingsProps {
    backgroundMode: BackgroundMode;
    themePreset?: ThemePresetId;
    backgroundColor: string | null;
    backgroundGradient: string | null;
    backgroundImage: BackgroundImage | null;
    onModeChange: (mode: BackgroundMode) => void;
    onColorChange: (color: string) => void;
    onGradientChange: (gradientId: string) => void;
    onImageAdjust: (adjustments: Partial<Pick<BackgroundImage, "accent" | "blur" | "brightness">>) => void;
}

const PRESET_COLORS = [
    { hex: "#0f1d32", name: "Navy" },
    { hex: "#1a1030", name: "Deep Plum" },
    { hex: "#0a2540", name: "Ocean" },
    { hex: "#1a0a0a", name: "Dark Cherry" },
    { hex: "#0a1a0f", name: "Forest" },
    { hex: "#1a1a2e", name: "Indigo Night" },
    { hex: "#2d1f4e", name: "Purple" },
    { hex: "#1a1520", name: "Charcoal" },
];

function ColorSwatch({
    hex,
    name,
    selected,
    onSelect,
}: {
    hex: string;
    name: string;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-label={`${name} background color`}
            aria-pressed={selected}
            className={cn(
                "relative h-11 w-11 rounded-xl transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                "ring-1 ring-white/10 hover:ring-white/20",
                selected && "ring-2 ring-[color:var(--accent-primary)]",
            )}
            style={{ background: hex }}
        >
            {selected && (
                <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow-md" />
            )}
        </button>
    );
}

function GradientSwatch({
    gradient,
    selected,
    onSelect,
}: {
    gradient: GradientPreset;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-label={`${gradient.name} gradient`}
            aria-pressed={selected}
            className={cn(
                "group relative flex h-24 w-full flex-col justify-end overflow-hidden rounded-xl p-2 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                "ring-1 ring-white/10 hover:ring-white/20",
                selected && "ring-2 ring-[color:var(--accent-primary)]",
            )}
            style={{
                background: `linear-gradient(${gradient.direction}deg, ${gradient.color1}, ${gradient.color2})`,
            }}
        >
            {selected && (
                <Check size={14} className="absolute right-2 top-2 text-white drop-shadow-md" />
            )}
            <span className="text-xs font-medium text-white drop-shadow-sm">
                {gradient.name}
            </span>
        </button>
    );
}

export function BackgroundSettings({
    backgroundMode,
    themePreset = "default",
    backgroundColor,
    backgroundGradient,
    backgroundImage,
    onModeChange,
    onColorChange,
    onGradientChange,
    onImageAdjust,
}: BackgroundSettingsProps) {
    const photoActive = backgroundMode === "image" && Boolean(backgroundImage);
    const preset = THEME_PRESET_MAP[themePreset] ?? THEME_PRESET_MAP.default;
    const defaultBackground = preset.suggestedGradient
        ? `linear-gradient(${preset.suggestedGradient.direction}deg, ${preset.suggestedGradient.color1}, ${preset.suggestedGradient.color2})`
        : "var(--color-twilight-deep)";
    const fileInput = useRef<HTMLInputElement>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const upload = useUploadBackgroundImage();

    const choosePhoto = (file?: File) => {
        if (upload.isPending || pendingFile) return;
        if (!file) {
            fileInput.current?.click();
            return;
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            toast.error("Choose a JPEG, PNG or WebP image.");
            return;
        }
        if (!file.size || file.size > 25 * 1024 * 1024) {
            toast.error("Choose an image smaller than 25 MB.");
            return;
        }
        setPendingFile(file);
    };

    return (
        <div className="flex flex-col gap-4">
            <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Choose background photo"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) choosePhoto(file);
                }}
            />
            {pendingFile && (
                <PhotoCropDialog
                    file={pendingFile}
                    isUploading={upload.isPending}
                    onCancel={() => setPendingFile(null)}
                    onConfirm={async (cropped) => {
                        await upload.mutateAsync(cropped);
                        setPendingFile(null);
                    }}
                />
            )}
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="Background source">
                <button
                    type="button"
                    aria-pressed={!photoActive}
                    disabled={upload.isPending}
                    onClick={() => {
                        if (photoActive) onModeChange(backgroundColor || backgroundGradient ? "custom" : "theme");
                    }}
                    className={cn(
                        "flex min-h-28 cursor-pointer flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                        !photoActive ? "border-accent-primary bg-accent-primary/5" : "border-twilight-border-light hover:bg-twilight-surface",
                    )}
                >
                    <span className="flex w-full items-center justify-between text-accent-primary">
                        <Palette size={22} aria-hidden="true" />
                        {!photoActive && <Check size={16} aria-hidden="true" />}
                    </span>
                    <span className="text-sm font-medium text-twilight-text">Cadence</span>
                    <span className="text-xs text-twilight-text-muted">Preset backgrounds and colors</span>
                </button>
                <button
                    type="button"
                    aria-label={backgroundImage ? "Your photo" : "Add a background photo"}
                    aria-pressed={photoActive}
                    disabled={upload.isPending}
                    onClick={() => {
                        if (!backgroundImage) choosePhoto();
                        else if (!photoActive) onModeChange("image");
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        const file = event.dataTransfer.files?.[0];
                        if (file) choosePhoto(file);
                    }}
                    className={cn(
                        "flex min-h-28 cursor-pointer flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                        photoActive ? "border-accent-primary bg-accent-primary/5" : "border-dashed border-twilight-border-light hover:bg-twilight-surface",
                    )}
                >
                    <span className="flex w-full items-center justify-between text-accent-primary">
                        {backgroundImage ? <Image size={22} aria-hidden="true" /> : <Plus size={22} aria-hidden="true" />}
                        {photoActive && <Check size={16} aria-hidden="true" />}
                    </span>
                    <span className="text-sm font-medium text-twilight-text">Your photo</span>
                    <span className="text-xs text-twilight-text-muted">
                        {photoActive ? "Your background and accents" : backgroundImage ? "Use your saved photo" : "Choose or drop an image"}
                    </span>
                </button>
            </div>

            {photoActive && backgroundImage ? (
                <PhotoBackgroundPanel
                    image={backgroundImage}
                    uploading={upload.isPending}
                    onChoosePhoto={choosePhoto}
                    onAdjust={onImageAdjust}
                />
            ) : (
                <div className="flex flex-col gap-5">
                    <p className="text-sm text-twilight-text-muted">
                        Use {preset.name}’s background, or choose another below. Your accent palette stays the same.
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="group" aria-label="Cadence backgrounds">
                        <button
                            type="button"
                            aria-pressed={backgroundMode === "theme"}
                            onClick={() => onModeChange("theme")}
                            className={cn(
                                "relative flex h-24 cursor-pointer flex-col justify-end rounded-xl p-2 text-left ring-1 ring-twilight-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                                backgroundMode === "theme" && "ring-2 ring-accent-primary",
                            )}
                            style={{ background: defaultBackground }}
                        >
                            {backgroundMode === "theme" && <Check size={14} className="absolute right-2 top-2 text-white" aria-hidden="true" />}
                            <span className="rounded-md bg-twilight-deep/90 px-2 py-1 text-xs text-twilight-text">Theme default</span>
                        </button>
                        {GRADIENT_PRESETS.map((gradient) => (
                            <GradientSwatch
                                key={gradient.id}
                                gradient={gradient}
                                selected={backgroundMode === "custom" && backgroundGradient === gradient.id}
                                onSelect={() => onGradientChange(gradient.id)}
                            />
                        ))}
                    </div>
                    {/* Solid colors */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5">
                            <Palette size={12} className="text-twilight-text-muted" />
                            <span className="text-[11px] font-medium tracking-wide text-twilight-text-muted uppercase">
                                Solid Colors
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_COLORS.map((c) => (
                                <ColorSwatch
                                    key={c.hex}
                                    hex={c.hex}
                                    name={c.name}
                                    selected={
                                        backgroundMode === "custom" && backgroundColor === c.hex && !backgroundGradient
                                    }
                                    onSelect={() => onColorChange(c.hex)}
                                />
                            ))}
                            {/* Custom color input */}
                            <label
                                className={cn(
                                    "relative flex h-11 w-11 items-center justify-center rounded-xl cursor-pointer",
                                    "border border-dashed border-twilight-border-light hover:border-twilight-text-muted transition-colors focus-within:ring-2 focus-within:ring-accent-primary",
                                )}

                            >
                                <span className="text-[10px] text-twilight-text-muted">+</span>
                                <input
                                    type="color"
                                    aria-label="Custom background color"
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    value={backgroundColor ?? "#0f1d32"}
                                    onChange={(e) => onColorChange(e.target.value)}
                                />
                            </label>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
