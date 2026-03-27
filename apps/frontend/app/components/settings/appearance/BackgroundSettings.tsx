import { Check, Palette, Droplets } from "lucide-react";
import { cn } from "../../../lib/utils";
import { SegmentedControl } from "./SegmentedControl";
import { GRADIENT_PRESETS, type GradientPreset } from "../../../lib/themes/gradient-presets";

type BackgroundMode = "theme" | "custom";

interface BackgroundSettingsProps {
    backgroundMode: BackgroundMode;
    backgroundColor: string | null;
    backgroundGradient: string | null;
    onModeChange: (mode: BackgroundMode) => void;
    onColorChange: (color: string) => void;
    onGradientChange: (gradientId: string) => void;
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
                "relative h-10 w-10 rounded-xl transition-all duration-200 cursor-pointer",
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
                "group relative flex h-14 w-full flex-col justify-end overflow-hidden rounded-xl p-2 transition-all duration-200 cursor-pointer",
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
            <span className="text-[10px] font-medium text-white/70 drop-shadow-sm">
                {gradient.name}
            </span>
        </button>
    );
}

export function BackgroundSettings({
    backgroundMode,
    backgroundColor,
    backgroundGradient,
    onModeChange,
    onColorChange,
    onGradientChange,
}: BackgroundSettingsProps) {
    return (
        <div className="flex flex-col gap-4">
            <SegmentedControl
                value={backgroundMode}
                onChange={onModeChange}
                options={[
                    { value: "theme" as BackgroundMode, label: "Theme Default" },
                    { value: "custom" as BackgroundMode, label: "Custom" },
                ]}
            />

            {backgroundMode === "custom" && (
                <div className="flex flex-col gap-5">
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
                                        backgroundColor === c.hex && !backgroundGradient
                                    }
                                    onSelect={() => onColorChange(c.hex)}
                                />
                            ))}
                            {/* Custom color input */}
                            <label
                                className={cn(
                                    "relative flex h-10 w-10 items-center justify-center rounded-xl cursor-pointer",
                                    "border border-dashed border-twilight-border-light hover:border-twilight-text-muted transition-colors",
                                )}
                                aria-label="Pick custom color"
                            >
                                <span className="text-[10px] text-twilight-text-muted">+</span>
                                <input
                                    type="color"
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    value={backgroundColor ?? "#0f1d32"}
                                    onChange={(e) => onColorChange(e.target.value)}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Gradients */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5">
                            <Droplets size={12} className="text-twilight-text-muted" />
                            <span className="text-[11px] font-medium tracking-wide text-twilight-text-muted uppercase">
                                Gradients
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {GRADIENT_PRESETS.map((g) => (
                                <GradientSwatch
                                    key={g.id}
                                    gradient={g}
                                    selected={backgroundGradient === g.id}
                                    onSelect={() => onGradientChange(g.id)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
