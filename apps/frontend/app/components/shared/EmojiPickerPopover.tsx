import React, { Suspense } from "react";
import * as Popover from "../primitives/Popover";
import { Smile } from "lucide-react";
import data from "@emoji-mart/data";

const Picker = React.lazy(() => import("@emoji-mart/react"));

interface EmojiPickerPopoverProps {
    emoji?: string;
    onSelect: (emoji: string) => void;
    children?: React.ReactNode;
    contentClassName?: string;
}

export function EmojiPickerPopover({ emoji, onSelect, children, contentClassName }: EmojiPickerPopoverProps) {
    return (
        <Popover.Root>
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
            <Popover.Content
                side="bottom"
                align="start"
                className={`overflow-hidden rounded-xl p-0 ${contentClassName ?? ""}`}
            >
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
