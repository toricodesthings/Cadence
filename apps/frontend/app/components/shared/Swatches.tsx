import { Check } from "lucide-react";
import { TAG_PALETTE } from "../../lib/constants/colors";
import { resolveTagColor } from "../../lib/utils/color-resolver";

export type SwatchOption = { value: string; color: string; label: string };

export const TAG_SWATCHES: SwatchOption[] = TAG_PALETTE.map((c) => ({ value: c, color: resolveTagColor(c), label: c === "default" ? "Default" : c }));

/** Colour swatches sized for a thumb — project and tag forms on compact. */
export function Swatches({ options, value, onChange }: { options: SwatchOption[]; value: string; onChange: (value: string) => void }) {
    return (
        <div role="radiogroup" aria-label="Colour" className="grid grid-cols-8 gap-2">
            {options.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.label} onClick={() => onChange(o.value)}
                    className="flex aspect-square cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95"
                    style={{ backgroundColor: o.color }}>
                    {value === o.value ? <Check size={16} className="text-[var(--primary-foreground)]" aria-hidden="true" /> : null}
                </button>
            ))}
        </div>
    );
}
