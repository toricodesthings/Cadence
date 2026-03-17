import React, { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NotesToolbar, type NotesToolbarAction } from "./NotesToolbar";

interface MarkdownEditorProps {
    notes: string;
    isEditing: boolean;
    setIsEditing: (editing: boolean) => void;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    maxLength?: number;
    isFocusMode?: boolean;
    onToggleFocusMode?: () => void;
}

export function MarkdownEditor({
    notes,
    isEditing,
    setIsEditing,
    onChange,
    maxLength = 10000,
    isFocusMode = false,
    onToggleFocusMode,
}: MarkdownEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isPreview, setIsPreview] = useState(false);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(
                textareaRef.current.value.length,
                textareaRef.current.value.length
            );
        }
    }, [isEditing]);

    useEffect(() => {
        if (!isEditing) {
            setIsPreview(false);
        }
    }, [isEditing]);

    const dispatchValue = (value: string) => {
        onChange({
            target: { value },
        } as React.ChangeEvent<HTMLTextAreaElement>);
    };

    const applyAction = (action: NotesToolbarAction) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = notes.slice(start, end);

        let nextValue = notes;
        let nextStart = start;
        let nextEnd = end;

        switch (action) {
            case "bold": {
                const wrapped = `**${selected || "bold"}**`;
                nextValue = `${notes.slice(0, start)}${wrapped}${notes.slice(end)}`;
                nextStart = start + 2;
                nextEnd = start + wrapped.length - 2;
                break;
            }
            case "italic": {
                const wrapped = `*${selected || "italic"}*`;
                nextValue = `${notes.slice(0, start)}${wrapped}${notes.slice(end)}`;
                nextStart = start + 1;
                nextEnd = start + wrapped.length - 1;
                break;
            }
            case "heading": {
                const prefix = selected ? `## ${selected}` : "## Heading";
                nextValue = `${notes.slice(0, start)}${prefix}${notes.slice(end)}`;
                nextStart = start + 3;
                nextEnd = start + prefix.length;
                break;
            }
            case "bullet-list": {
                const prefix = selected ? selected.split("\n").map((line) => `- ${line}`).join("\n") : "- List item";
                nextValue = `${notes.slice(0, start)}${prefix}${notes.slice(end)}`;
                nextStart = start + 2;
                nextEnd = start + prefix.length;
                break;
            }
            case "checklist": {
                const prefix = selected ? selected.split("\n").map((line) => `- [ ] ${line}`).join("\n") : "- [ ] Checklist item";
                nextValue = `${notes.slice(0, start)}${prefix}${notes.slice(end)}`;
                nextStart = start + 6;
                nextEnd = start + prefix.length;
                break;
            }
            case "link": {
                const prefix = `[${selected || "Link text"}](https://)`;
                nextValue = `${notes.slice(0, start)}${prefix}${notes.slice(end)}`;
                nextStart = start + 1;
                nextEnd = start + (selected ? selected.length + 1 : 10);
                break;
            }
            case "code": {
                const prefix = selected ? `\`${selected}\`` : "`code`";
                nextValue = `${notes.slice(0, start)}${prefix}${notes.slice(end)}`;
                nextStart = start + 1;
                nextEnd = start + prefix.length - 1;
                break;
            }
            case "quote": {
                const prefix = selected ? selected.split("\n").map((line) => `> ${line}`).join("\n") : "> Quote";
                nextValue = `${notes.slice(0, start)}${prefix}${notes.slice(end)}`;
                nextStart = start + 2;
                nextEnd = start + prefix.length;
                break;
            }
            case "divider": {
                const prefix = `${start > 0 ? "\n" : ""}\n---\n`;
                nextValue = `${notes.slice(0, start)}${prefix}${notes.slice(end)}`;
                nextStart = start + prefix.length;
                nextEnd = nextStart;
                break;
            }
        }

        dispatchValue(nextValue);
        setIsEditing(true);
        setIsPreview(false);

        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(nextStart, nextEnd);
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!(e.metaKey || e.ctrlKey)) return;

        const key = e.key.toLowerCase();
        if (key === "b") {
            e.preventDefault();
            applyAction("bold");
        } else if (key === "i") {
            e.preventDefault();
            applyAction("italic");
        } else if (key === "k") {
            e.preventDefault();
            applyAction("link");
        }
    };

    return (
        <div className="relative flex min-h-[180px] w-full flex-1 flex-col gap-3">
            {isEditing ? (
                <>
                    <NotesToolbar
                        onAction={applyAction}
                        isPreview={isPreview}
                        onTogglePreview={() => setIsPreview((value) => !value)}
                        isFocusMode={isFocusMode}
                        onToggleFocusMode={onToggleFocusMode}
                    />
                    {isPreview ? (
                        <div className="prose prose-invert prose-sm min-h-[180px] max-w-none rounded-[1.4rem] border border-twilight-border/40 bg-white/[0.03] px-4 py-4 prose-p:text-twilight-text prose-a:text-lantern prose-code:text-moonlit">
                            {notes ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown> : <span className="text-twilight-text-muted/90 italic">Nothing to preview yet.</span>}
                        </div>
                    ) : (
                        <textarea
                            ref={textareaRef}
                            value={notes}
                            onChange={onChange}
                            onBlur={() => setIsEditing(false)}
                            onKeyDown={handleKeyDown}
                            placeholder="Write your notes here…"
                            aria-label="Task notes editor"
                            className="
                                min-h-[220px] w-full flex-1 resize-none rounded-[1.4rem] border border-twilight-border/40 bg-white/[0.03] px-4 py-4 outline-none
                                font-sans text-sm leading-relaxed text-twilight-text
                                placeholder:text-twilight-text-muted/90
                            "
                            maxLength={maxLength}
                        />
                    )}
                </>
            ) : (
                <div
                    onClick={() => setIsEditing(true)}
                    className="prose prose-invert prose-sm min-h-[180px] max-w-none cursor-text rounded-[1.4rem] border border-twilight-border/40 bg-white/[0.03] px-4 py-4 prose-p:text-twilight-text prose-a:text-lantern prose-code:text-moonlit"
                    aria-label="Task notes preview"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setIsEditing(true);
                        }
                    }}
                >
                    {notes ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
                    ) : (
                        <span className="text-twilight-text-muted/90 italic">Add notes...</span>
                    )}
                </div>
            )}
        </div>
    );
}
