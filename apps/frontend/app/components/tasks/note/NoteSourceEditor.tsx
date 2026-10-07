import { useRef } from "react";
import { applyMarkdownAction, type MarkdownAction } from "../../../lib/notes/markdown-transforms";
import { cn } from "../../../lib/utils";

/**
 * The exceptional Markdown view (Edit Markdown, or a note the visual editor can't carry whole).
 * Same note session and save rules as visual editing; it just edits the stored text directly.
 */
export function NoteSourceEditor({ value, onChange, onSave, className }: { value: string; onChange: (value: string) => void; onSave?: () => void; className?: string }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const apply = (action: MarkdownAction) => {
        const el = ref.current;
        if (!el) return;
        const result = applyMarkdownAction(value, el.selectionStart, el.selectionEnd, action);
        onChange(result.value);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(result.selectionStart, result.selectionEnd);
        });
    };
    return (
        <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || !(e.metaKey || e.ctrlKey)) return;
                const key = e.key.toLowerCase();
                if (key === "s") { e.preventDefault(); onSave?.(); }
                else if (key === "b") { e.preventDefault(); apply("bold"); }
                else if (key === "i") { e.preventDefault(); apply("italic"); }
                else if (key === "k") { e.preventDefault(); apply("link"); }
            }}
            aria-label="Task notes, Markdown source"
            spellCheck
            className={cn("block min-h-[50dvh] w-full resize-none bg-transparent font-mono text-[15px] leading-[1.7] text-twilight-text outline-none placeholder:text-twilight-text-muted", className)}
            placeholder="Start writing…"
        />
    );
}
