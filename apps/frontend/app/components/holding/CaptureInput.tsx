import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Check } from "lucide-react";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Universal capture composer for the Holding page.
 *
 * §9.1 enhancements:
 * - `mod+enter` for forced task capture
 * - `shift+enter` for multiline note capture
 * - Visible "Captured" confirmation state (1.5 s)
 * - `Esc` clears input but does not blur if non-empty
 */
export function CaptureInput() {
    const [value, setValue] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const [showCaptured, setShowCaptured] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const capturedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const createInboxItem = useCreateInboxItem();

    const handleSubmit = useCallback((forceTask?: boolean) => {
        const text = value.trim();
        if (!text) return;
        createInboxItem.mutate(text, {
            onSuccess: () => {
                // Show "Captured" confirmation
                setShowCaptured(true);
                clearTimeout(capturedTimerRef.current);
                capturedTimerRef.current = setTimeout(() => setShowCaptured(false), 1500);
            },
        });
        setValue("");
        // Re-focus for rapid capture flow
        inputRef.current?.focus();
    }, [value, createInboxItem]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // mod+enter → forced task capture
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit(true);
            return;
        }
        // shift+enter → newline (default textarea behavior)
        if (e.key === "Enter" && e.shiftKey) {
            return;
        }
        // enter → capture
        if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
            return;
        }
        // esc → clear input, blur only if empty
        if (e.key === "Escape") {
            if (value.trim()) {
                setValue("");
            } else {
                inputRef.current?.blur();
            }
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

    // Cleanup timer
    useEffect(() => () => clearTimeout(capturedTimerRef.current), []);

    return (
        <div
            data-focus-container
            className={`
                group relative overflow-hidden rounded-[1.65rem] border
                transition-[color,background-color,border-color,box-shadow,transform] duration-200
                ${isFocused
                    ? "border-accent-primary/18 bg-white/[0.035] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_5%,transparent),0_18px_46px_rgba(3,8,18,0.22),inset_0_1px_0_rgba(255,255,255,0.03)]"
                    : "border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-white/[0.08] hover:bg-white/[0.028]"
                }
                backdrop-blur-md
            `}
        >
            <div className="flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-2.5">
                <Sparkles
                    size={17}
                    aria-hidden="true"
                    className={`shrink-0 transition-colors duration-200 ${isFocused ? "text-accent-primary" : "text-twilight-text-muted/70"}`}
                />
                <div
                    className={`
                        flex min-h-[3.9rem] lg:min-h-[2.85rem] flex-1 items-center rounded-[1.2rem] border px-4 transition-[background-color,border-color,box-shadow] duration-200
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

            {/* ── "Captured" confirmation state — shows for 1.5 s ── */}
            <AnimatePresence>
                {showCaptured && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 py-3 pointer-events-none"
                    >
                        <div className="flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1 text-[12px] font-medium text-green-400">
                            <Check size={13} aria-hidden="true" />
                            Captured
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Subtle hint row — only visible when focused and empty */}
            {isFocused && !value.trim() && (
                <div className="border-t border-white/[0.05] px-5 pb-4 pt-2.5 lg:px-6">
                    <p className="text-[12px] text-twilight-text-muted/78">
                        Press <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-twilight-text-soft">Enter</kbd> to capture
                        <span className="mx-1.5 text-twilight-border">·</span>
                        <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-twilight-text-soft">⌘ Enter</kbd> as task
                        <span className="mx-1.5 text-twilight-border">·</span>
                        <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-twilight-text-soft">Shift + Enter</kbd> for new line
                    </p>
                </div>
            )}
        </div>
    );
}
