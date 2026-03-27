import { useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "../../../lib/utils";
import { THEME_PRESETS, type ThemePresetId, type ThemePreset } from "../../../lib/themes/theme-presets";
import { ACCENT_PALETTES } from "../../../lib/themes/accent-palettes";

interface ThemePresetCardProps {
    preset: ThemePreset;
    selected: boolean;
    onSelect: () => void;
}

function ThemePresetCard({ preset, selected, onSelect }: ThemePresetCardProps) {
    const palette = ACCENT_PALETTES.find((p) => p.id === preset.palette);
    const colors = preset.baseMode === "daylight" ? palette?.daylight : palette?.twilight;
    const bg = preset.baseMode === "daylight" ? "#f8fafc" : "#0f1d32";
    const surfaceBg = preset.baseMode === "daylight" ? "#ffffff" : "#1a2744";

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-label={`${preset.name} theme`}
            aria-pressed={selected}
            className={cn(
                "group flex w-[140px] flex-shrink-0 flex-col gap-2 rounded-2xl border p-2.5 text-left transition-all duration-200",
                "cursor-pointer snap-start",
                selected
                    ? "border-[color:var(--accent-primary)]/40 bg-[color:var(--accent-primary)]/[0.06]"
                    : "border-twilight-border-light bg-white/[0.02] hover:bg-white/[0.04]",
            )}
        >
            {/* Mini preview */}
            <div
                className="relative flex h-20 w-full flex-col justify-between overflow-hidden rounded-lg p-2"
                style={{
                    background: preset.suggestedGradient
                        ? `linear-gradient(${preset.suggestedGradient.direction}deg, ${preset.suggestedGradient.color1}, ${preset.suggestedGradient.color2})`
                        : bg,
                }}
            >
                {preset.surfaceTint && (
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{ background: preset.surfaceTint }}
                    />
                )}
                <div className="relative flex gap-1">
                    <div
                        className="h-1.5 w-5 rounded-full"
                        style={{ background: colors?.primary }}
                    />
                    <div
                        className="h-1.5 w-3 rounded-full"
                        style={{ background: colors?.secondary, opacity: 0.6 }}
                    />
                </div>
                <div className="relative flex gap-1">
                    <div
                        className="h-3 flex-1 rounded"
                        style={{ background: surfaceBg, opacity: 0.6 }}
                    />
                    <div
                        className="h-3 flex-1 rounded"
                        style={{ background: surfaceBg, opacity: 0.4 }}
                    />
                </div>
                {selected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Check size={18} className="text-white drop-shadow-md" />
                    </div>
                )}
            </div>

            {/* Label */}
            <div className="flex items-center gap-1.5 px-0.5">
                <span className="text-sm">{preset.icon}</span>
                <span className="truncate text-[12px] font-medium text-twilight-text">
                    {preset.name}
                </span>
            </div>
            <span className="line-clamp-2 px-0.5 text-[10px] leading-tight text-twilight-text-muted">
                {preset.mood}
            </span>
        </button>
    );
}

interface ThemeCarouselProps {
    value: ThemePresetId;
    onChange: (preset: ThemePresetId) => void;
}

export function ThemeCarousel({ value, onChange }: ThemeCarouselProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = useCallback((dir: "left" | "right") => {
        const el = scrollRef.current;
        if (!el) return;
        const amount = dir === "left" ? -300 : 300;
        el.scrollBy({ left: amount, behavior: "smooth" });
    }, []);

    return (
        <div className="relative">
            {/* Scroll buttons */}
            <button
                type="button"
                onClick={() => scroll("left")}
                className="absolute -left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-twilight-border-light bg-twilight-surface p-1.5 text-twilight-text-muted shadow-md transition-colors hover:text-twilight-text hover:bg-twilight-elevated cursor-pointer"
                aria-label="Scroll themes left"
            >
                <ChevronLeft size={14} />
            </button>
            <button
                type="button"
                onClick={() => scroll("right")}
                className="absolute -right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-twilight-border-light bg-twilight-surface p-1.5 text-twilight-text-muted shadow-md transition-colors hover:text-twilight-text hover:bg-twilight-elevated cursor-pointer"
                aria-label="Scroll themes right"
            >
                <ChevronRight size={14} />
            </button>

            {/* Carousel track */}
            <div
                ref={scrollRef}
                className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 py-1 scrollbar-hide"
                role="listbox"
                aria-label="Theme presets"
            >
                {THEME_PRESETS.map((preset) => (
                    <ThemePresetCard
                        key={preset.id}
                        preset={preset}
                        selected={value === preset.id}
                        onSelect={() => onChange(preset.id)}
                    />
                ))}
            </div>
        </div>
    );
}
