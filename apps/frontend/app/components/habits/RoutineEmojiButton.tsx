import { SmilePlus } from "lucide-react";
import { Tip } from "../primitives";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";

/**
 * The routine's emoji, set where its name is (create and edit). With none set
 * it shows an "add emoji" glyph so it reads as a control, not a type icon.
 */
export function RoutineEmojiButton({ emoji, onChange }: { emoji: string | null; onChange: (emoji: string | null) => void }) {
    const label = emoji ? "Change emoji" : "Add an emoji";
    return (
        <EmojiPickerPopover emoji={emoji ?? ""} onSelect={(next) => onChange(next || null)} onClear={() => onChange(null)}>
            <Tip label={label} side="bottom">
                <button
                    type="button"
                    aria-label={label}
                    className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border bg-white/[0.04] text-[20px] leading-none transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                        emoji ? "border-white/[0.06]" : "border-dashed border-white/[0.14] text-twilight-text-soft hover:text-accent-primary"
                    }`}
                >
                    {emoji || <SmilePlus size={18} aria-hidden="true" />}
                </button>
            </Tip>
        </EmojiPickerPopover>
    );
}
