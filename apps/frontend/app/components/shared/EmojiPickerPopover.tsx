import React, { Suspense } from "react";
import * as Popover from "../primitives/Popover";
import { Smile } from "lucide-react";
import { Tip } from "../primitives/Tooltip";
import data from "@emoji-mart/data";

const Picker = React.lazy(() => import("@emoji-mart/react"));

interface EmojiPickerPopoverProps {
    emoji?: string;
    onSelect: (emoji: string) => void;
    children?: React.ReactNode;
    /** Shows "Remove emoji" above the picker while one is set. */
    onClear?: () => void;
    /** Tooltip for an icon-only trigger. */
    tip?: string;
}

export function EmojiPickerPopover({ emoji, onSelect, children, onClear, tip }: EmojiPickerPopoverProps) {
    const trigger = (
        <Popover.Trigger asChild>
            {children ? (
                children
            ) : (
                <button
                    type="button"
                    aria-label="Pick an emoji"
                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-white/[0.04] text-lg text-twilight-text transition-colors hover:border-twilight-border-interactive focus:border-twilight-border-interactive"
                >
                    {emoji || <Smile size={16} className="text-twilight-text-muted" />}
                </button>
            )}
        </Popover.Trigger>
    );
    return (
        <Popover.Root>
            {tip ? <Tip label={tip} side="bottom">{trigger}</Tip> : trigger}
            <Popover.Content
                side="bottom"
                align="start"
                className="overflow-hidden rounded-xl p-0"
            >
                {emoji && onClear ? (
                    <Popover.Close asChild>
                        <button
                            type="button"
                            onClick={onClear}
                            className="flex min-h-11 w-full cursor-pointer items-center justify-center border-b border-white/[0.06] text-sm text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/50"
                        >
                            Remove emoji
                        </button>
                    </Popover.Close>
                ) : null}
                <Suspense
                    fallback={
                        <div className="w-[352px] h-[435px] flex items-center justify-center text-twilight-text-muted text-sm">
                            Loading emojis...
                        </div>
                    }
                >
                    <Picker
                        data={data}
                        onEmojiSelect={(e: any) => onSelect(e.native)}
                        theme="dark"
                        autoFocus={true}
                    />
                </Suspense>
            </Popover.Content>
        </Popover.Root>
    );
}
