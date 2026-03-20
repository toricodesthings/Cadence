import { useState, useRef, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";

/**
 * Universal capture composer for the Holding page.
 *
 * Design rules (from the remediation plan):
 * - One primary action above the fold: capture.
 * - No premature typing taxonomy — user types first, classification comes second.
 * - Prompt should feel calm, inviting, and outcome-oriented.
 * - Must feel like the sanctuary, not a form field.
 */
export function CaptureInput() {
    const [value, setValue] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const createInboxItem = useCreateInboxItem();

    const handleSubmit = () => {
        const text = value.trim();
        if (!text) return;
        createInboxItem.mutate(text);
        setValue("");
        // Re-focus for rapid capture flow
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape") {
            setValue("");
            inputRef.current?.blur();
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        const singleLineHeight = 24;
        el.style.height = "auto";
        el.style.height = `${Math.max(singleLineHeight, Math.min(el.scrollHeight, 160))}px`;
    }, [value]);

    return (
        <div
            data-focus-container
            className={`
                group relative overflow-hidden rounded-[1.65rem] border
                transition-[color,background-color,border-color,box-shadow,transform] duration-200
                ${isFocused
                    ? "border-lantern/18 bg-white/[0.035] shadow-[0_0_0_1px_rgba(232,164,74,0.05),0_18px_46px_rgba(3,8,18,0.22),inset_0_1px_0_rgba(255,255,255,0.03)]"
                    : "border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-white/[0.08] hover:bg-white/[0.028]"
                }
                backdrop-blur-md
            `}
        >
            <div className="flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-3.5">
                <Sparkles
                    size={17}
                    aria-hidden="true"
                    className={`shrink-0 transition-colors duration-200 ${isFocused ? "text-lantern" : "text-twilight-text-muted/70"}`}
                />
                <div
                    className={`
                        flex min-h-[3.9rem] flex-1 items-center rounded-[1.2rem] border px-4 transition-[background-color,border-color,box-shadow] duration-200
                        ${isFocused
                            ? "border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                            : "border-white/[0.05] bg-white/[0.018]"
                        }
                    `}
                >
                    <textarea
                        ref={inputRef}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        onKeyDown={handleKeyDown}
                        placeholder="What's on your mind?"
                        rows={1}
                        aria-label="Capture anything — thoughts, tasks, ideas"
                        className="block max-h-[160px] w-full appearance-none resize-none border-0 bg-transparent p-0 text-[15px] leading-6 text-twilight-text shadow-none outline-none ring-0 placeholder:text-twilight-text-muted/60 focus:border-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                    />
                </div>
            </div>

            {/* Subtle hint row — only visible when focused and empty */}
            {isFocused && !value.trim() && (
                <div className="border-t border-white/[0.05] px-5 pb-4 pt-2.5 lg:px-6">
                    <p className="text-[12px] text-twilight-text-muted/78">
                        Press <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-twilight-text-soft">Enter</kbd> to capture
                        <span className="mx-1.5 text-twilight-border">·</span>
                        <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-twilight-text-soft">Shift + Enter</kbd> for new line
                    </p>
                </div>
            )}
        </div>
    );
}
