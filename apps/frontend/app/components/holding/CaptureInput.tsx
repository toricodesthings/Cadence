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
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [value]);

    return (
        <div
            className={`
                group relative rounded-[1.5rem] border
                transition-[color,background-color,border-color,box-shadow] duration-200
                ${isFocused
                    ? "border-lantern/25 bg-white/[0.04] shadow-[0_0_0_1px_rgba(232,164,74,0.08),0_4px_24px_rgba(232,164,74,0.04)]"
                    : "border-twilight-border bg-twilight-surface/30 hover:border-twilight-border-light hover:bg-white/[0.02]"
                }
                backdrop-blur-md
            `}
        >
            <div className="flex items-start gap-3 px-5 py-4">
                <Sparkles
                    size={18}
                    aria-hidden="true"
                    className={`mt-0.5 shrink-0 transition-colors duration-200 ${isFocused ? "text-lantern" : "text-twilight-text-muted/70"}`}
                />
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
                    className="flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-twilight-text outline-none placeholder:text-twilight-text-muted/60"
                />
            </div>

            {/* Subtle hint row — only visible when focused and empty */}
            {isFocused && !value.trim() && (
                <div className="border-t border-twilight-border/30 px-5 py-2.5">
                    <p className="text-[12px] text-twilight-text-muted/80">
                        Press <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-twilight-text-soft">Enter</kbd> to capture
                        <span className="mx-1.5 text-twilight-border">·</span>
                        <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-twilight-text-soft">Shift + Enter</kbd> for new line
                    </p>
                </div>
            )}
        </div>
    );
}
