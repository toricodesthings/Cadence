import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";

/** Save title changes on blur/Enter, and keep titles readable while resizing. */
export function DetailTitle({ value, onSave, onDraftChange, children, leading, label, maxLength, textareaRef }: {
    value: string;
    onSave: (value: string) => void;
    onDraftChange?: (value: string) => void;
    children?: ReactNode;
    /** Sits before the title, e.g. an emoji picker. */
    leading?: ReactNode;
    label: string;
    maxLength?: number;
    textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
    const [draft, setDraft] = useState(value);
    const localRef = useRef<HTMLTextAreaElement>(null);
    const ref = textareaRef ?? localRef;
    useEffect(() => setDraft(value), [value]);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let active = true;
        const fit = () => { if (!active) return; el.style.height = "0px"; el.style.height = `${el.scrollHeight}px`; };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        void document.fonts?.ready.then(fit);
        return () => { active = false; observer.disconnect(); };
    }, [draft, ref]);
    return (
        <section className="shrink-0 rounded-[1.35rem] border border-twilight-border/35 bg-white/[0.025] px-5 py-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Title</p>
            <div className="flex items-start gap-3">
            {leading}
            <textarea ref={ref} rows={1} value={draft} maxLength={maxLength} aria-label={label}
                onChange={(e) => { setDraft(e.target.value); onDraftChange?.(e.target.value); }}
                onBlur={() => {
                    const next = draft.trim();
                    if (!next) setDraft(value);
                    else if (next !== value) onSave(next);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                    if (e.key === "Escape") { e.stopPropagation(); setDraft(value); onDraftChange?.(value); }
                }}
                className="min-h-0 w-full resize-none overflow-hidden bg-transparent font-display text-[1.3rem] font-semibold leading-[1.25] tracking-[-0.025em] text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            />
            </div>
            {children}
        </section>
    );
}
