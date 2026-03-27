import { Check } from "lucide-react";
import { cn } from "../../../lib/utils";
import {
    ACCENT_PALETTES,
    type PaletteId,
    type PaletteDefinition,
} from "../../../lib/themes/accent-palettes";

interface PaletteCardProps {
    palette: PaletteDefinition;
    selected: boolean;
    onSelect: () => void;
    isDaylight: boolean;
}

function PaletteCard({ palette, selected, onSelect, isDaylight }: PaletteCardProps) {
    const colors = isDaylight ? palette.daylight : palette.twilight;

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-label={`${palette.name} palette`}
            aria-pressed={selected}
            className={cn(
                "group flex flex-col gap-2 rounded-2xl border p-3 text-left transition-all duration-200",
                "cursor-pointer w-full",
                selected
                    ? "border-[color:var(--accent-primary)]/40 bg-[color:var(--accent-primary)]/[0.06]"
                    : "border-twilight-border-light bg-white/[0.02] hover:bg-white/[0.04]",
            )}
        >
            {/* Color swatch row */}
            <div className="flex items-center gap-1.5">
                <div
                    className="h-6 w-6 rounded-full shadow-sm ring-1 ring-white/10"
                    style={{ background: colors.primary }}
                />
                <div
                    className="h-4 w-4 rounded-full ring-1 ring-white/10"
                    style={{ background: colors.secondary }}
                />
                <div
                    className="h-3 w-3 rounded-full ring-1 ring-white/10"
                    style={{ background: colors.tertiary }}
                />
                {selected && (
                    <Check
                        size={14}
                        className="ml-auto text-[color:var(--accent-primary)]"
                    />
                )}
            </div>

            {/* Label */}
            <div>
                <span className="text-[13px] font-medium text-twilight-text">
                    {palette.name}
                </span>
                <p className="text-[11px] leading-tight text-twilight-text-muted">
                    {palette.description}
                </p>
            </div>
        </button>
    );
}

interface PalettePickerProps {
    value: PaletteId;
    onChange: (palette: PaletteId) => void;
    theme: string;
}

export function PalettePicker({ value, onChange, theme }: PalettePickerProps) {
    const isDaylight = theme === "daylight";

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ACCENT_PALETTES.map((palette) => (
                <PaletteCard
                    key={palette.id}
                    palette={palette}
                    selected={value === palette.id}
                    onSelect={() => onChange(palette.id)}
                    isDaylight={isDaylight}
                />
            ))}
        </div>
    );
}
