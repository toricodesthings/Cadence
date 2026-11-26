import { useRef } from "react";
import { applyMarkdownAction, type MarkdownAction } from "../../../lib/notes/markdown-transforms";
import { cn } from "../../../lib/utils";

export function NoteSourceEditor({
    value,
    onChange,
    onSave,
    readOnly = false,
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    onSave?: () => void;
    readOnly?: boolean;
    className?: string;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const apply = (action: MarkdownAction) => {
        if (readOnly) return;
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
            readOnly={readOnly}
            onChange={(e) => {
                if (!readOnly) onChange(e.target.value);
            }}
            onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || !(e.metaKey || e.ctrlKey)) return;
                const key = e.key.toLowerCase();
                if (key === "s") {
                    e.preventDefault();
                    onSave?.();
                } else if (key === "b") {
                    e.preventDefault();
                    apply("bold");
                } else if (key === "i") {
                    e.preventDefault();
                    apply("italic");
                } else if (key === "k") {
                    e.preventDefault();
                    apply("link");
                }
            }}
            aria-label="Task notes, Markdown source"
            spellCheck
            className={cn(
                "block min-h-[50dvh] w-full resize-none bg-transparent font-mono text-[15px] leading-[1.7] text-twilight-text outline-none placeholder:text-twilight-text-muted",
                className,
            )}
            placeholder="Start writing…"
        />
    );
}
