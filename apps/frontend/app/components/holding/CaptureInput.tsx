import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";

/**
 * Universal capture composer for the Holding page.
 *
 * §9.1 enhancements:
 * - `mod+enter` for forced task capture
 * - `shift+enter` for multiline note capture
 * - "Captured" confirmation via the app-wide toast
 * - `Esc` clears input but does not blur if non-empty
 */
export function CaptureInput({ mobile = false, draft, onDraftChange, onCaptured }: {
    mobile?: boolean; draft?: string; onDraftChange?: (value: string) => void; onCaptured?: () => void;
}) {
    const [localValue, setLocalValue] = useState("");
    const value = draft ?? localValue;
    const setValue = onDraftChange ?? setLocalValue;
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const createInboxItem = useCreateInboxItem();

    const handleSubmit = useCallback((forceTask?: boolean) => {
        const text = value.trim();
        if (!text || (mobile && createInboxItem.isPending)) return;
        createInboxItem.mutate(text, {
            onSuccess: () => {
                toast.success("Captured");
                if (mobile) { setValue(""); onCaptured?.(); }
            },
        });
        if (!mobile) setValue("");
        // Re-focus for rapid capture flow
        inputRef.current?.focus();
    }, [value, createInboxItem, mobile, setValue, onCaptured]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mobile && !(e.key === "Enter" && (e.metaKey || e.ctrlKey))) return;
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

    if (mobile) return (
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); handleSubmit(); }}>
            <p className="text-sm text-twilight-text-soft">A thought, a task, a reminder. Get it out of your head; place it later.</p>
            <textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={handleKeyDown}
                aria-label="What's on your mind?" placeholder="What's on your mind?" rows={5}
                disabled={createInboxItem.isPending}
                className="w-full resize-none rounded-2xl border border-twilight-border bg-twilight-surface/40 p-4 text-base text-twilight-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary" />
            {createInboxItem.isError && <p role="alert" className="text-sm text-twilight-text-soft">Couldn’t save your capture. Your draft is still here. Try again.</p>}
            <button type="submit" disabled={!value.trim() || createInboxItem.isPending}
                className="min-h-12 rounded-2xl bg-accent-primary px-5 font-medium text-midnight disabled:opacity-50 active:opacity-80">
                {createInboxItem.isPending ? "Capturing…" : "Capture"}
            </button>
        </form>
    );

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
