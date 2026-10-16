import { Tip } from "../primitives/Tooltip";
import { PROJECT_ACCENT_OPTIONS, PROJECT_FALLBACK_COLOR } from "../../lib/constants/colors";

/** A list's colour: the named accents, or any hex through the native picker (a hex value means "custom"). */
export function ProjectColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const isCustom = value.startsWith("#");
    return (
        <div className="flex flex-wrap items-center gap-2">
            {PROJECT_ACCENT_OPTIONS.map((opt) => (
                <Tip key={opt.value} label={opt.label} side="top">
                    <button
                        type="button"
                        onClick={() => onChange(opt.value)}
                        aria-label={`Select ${opt.label} color`}
                        className={`h-5 w-5 cursor-pointer rounded-full transition-[transform,opacity] duration-150 ${value === opt.value
                            ? "scale-110 ring-2 ring-offset-2 ring-offset-twilight-surface"
                            : "opacity-60 hover:opacity-100"
                            }`}
                        style={{ backgroundColor: opt.varName }}
                    />
                </Tip>
            ))}
            <Tip label="Custom Hex Color" side="top">
                <div className="relative flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-twilight-border">
                    <input
                        type="color"
                        value={isCustom ? value : PROJECT_FALLBACK_COLOR}
                        onChange={(e) => onChange(e.target.value)}
                        className="absolute inset-[-10px] h-[200%] w-[200%] cursor-pointer"
                    />
                    {isCustom && (
                        <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-twilight-text/50 ring-offset-2 ring-offset-twilight-surface" />
                    )}
                </div>
            </Tip>
        </div>
    );
}
