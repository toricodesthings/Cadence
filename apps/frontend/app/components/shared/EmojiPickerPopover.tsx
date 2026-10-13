import React, { Suspense, useState } from "react";
import { Smile } from "lucide-react";
import { PickerSurface } from "./PickerSurface";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
const Picker = React.lazy(() => import("./EmojiPicker"));

interface EmojiPickerPopoverProps {
    emoji?: string;
    onSelect: (emoji: string) => void;
    children?: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
    /** Shows "Remove emoji" above the picker while one is set. */
    onClear?: () => void;
    /** Tooltip for an icon-only trigger. */
    tip?: string;
}

export function EmojiPickerPopover({ emoji, onSelect, children, onClear, tip }: EmojiPickerPopoverProps) {
    const [open, setOpen] = useState(false);
    // Touch opens the grid, not the keyboard over it.
    const { isTouch } = useShellMode();
    const trigger = children ?? (
        <button
            type="button"
            aria-label="Pick an emoji"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-white/[0.04] text-lg text-twilight-text transition-colors hover:border-twilight-border-interactive focus:border-twilight-border-interactive"
        >
            {emoji || <Smile size={16} className="text-twilight-text-muted" />}
        </button>
    );
    return (
        <PickerSurface
            trigger={trigger}
            title="Emoji"
            open={open}
            onOpenChange={setOpen}
            tip={tip}
            flush
            contentProps={{ side: "bottom", align: "start", className: "overflow-hidden rounded-xl p-0" }}
        >
            {emoji && onClear ? (
                <button
                    type="button"
                    onClick={() => { onClear(); setOpen(false); }}
                    className="flex min-h-11 w-full cursor-pointer items-center justify-center border-b border-white/[0.06] text-sm text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/50"
                >
                    Remove emoji
                </button>
            ) : null}
            <div className="flex justify-center">
                <Suspense
                    fallback={
                        <div className="w-[352px] h-[435px] flex items-center justify-center text-twilight-text-muted text-sm">
                            Loading emojis...
                        </div>
                    }
                >
                    <Picker
                        onEmojiSelect={(e: { native: string }) => { onSelect(e.native); setOpen(false); }}
                        autoFocus={!isTouch}
                    />
                </Suspense>
            </div>
        </PickerSurface>
    );
}
