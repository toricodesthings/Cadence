import type { ReactNode } from "react";
import { Pencil, SmilePlus } from "lucide-react";
import { EmojiPickerPopover } from "./EmojiPickerPopover";

/**
 * An item's emoji as a tappable tile (routines, events). Hover or focus lays a
 * pencil over it so it reads as "change", and with none set it shows `fallback`
 * the same way. The picker offers Remove while one is set.
 */
export function EmojiMarkButton({
    emoji,
    onChange,
    fallback = <SmilePlus size={18} aria-hidden="true" />,
}: {
    emoji: string | null;
    onChange: (emoji: string | null) => void;
    /** Shown when no emoji is set, e.g. the item type's icon. */
    fallback?: ReactNode;
}) {
    const label = emoji ? "Change emoji" : "Add an emoji";
    return (
        <EmojiPickerPopover emoji={emoji ?? ""} onSelect={(next) => onChange(next || null)} onClear={() => onChange(null)} tip={label}>
            <button
                type="button"
                aria-label={label}
                className="group/emoji relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.04] text-xl leading-none text-twilight-text-soft transition-colors hover:border-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                {emoji || fallback}
                <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center bg-twilight-void/65 text-twilight-text opacity-0 transition-opacity duration-150 group-hover/emoji:opacity-100 group-focus-visible/emoji:opacity-100"
                >
                    <Pencil size={15} />
                </span>
            </button>
        </EmojiPickerPopover>
    );
}
