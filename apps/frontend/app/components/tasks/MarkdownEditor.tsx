import React, { useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NotesToolbar, type NotesToolbarAction } from "./NotesToolbar";
import { applyMarkdownAction } from "../../lib/notes/markdown-transforms";

interface MarkdownEditorProps {
    notes: string;
    isEditing: boolean;
    setIsEditing: (editing: boolean) => void;
    onNotesChange: (value: string) => void;
    maxLength?: number;
}

export function MarkdownEditor({
    notes,
    isEditing,
    setIsEditing,
    onNotesChange,
    maxLength = 50000,
}: MarkdownEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Track whether a toolbar button was just pressed so we don't
    // treat the consequent blur as "user left the editor".
    const toolbarActiveRef = useRef(false);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(
                textareaRef.current.value.length,
                textareaRef.current.value.length
            );
        }
    }, [isEditing]);

    const applyAction = useCallback((action: NotesToolbarAction) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const result = applyMarkdownAction(
            notes,
            textarea.selectionStart,
            textarea.selectionEnd,
            action,
        );

        onNotesChange(result.value);
        setIsEditing(true);

        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(result.selectionStart, result.selectionEnd);
        });
    }, [notes, setIsEditing, onNotesChange]);

    /** Called by toolbar buttons on mouseDown to prevent blur from firing */
    const handleToolbarMouseDown = useCallback(() => {
        toolbarActiveRef.current = true;
    }, []);

    const handleBlur = useCallback(() => {
        // Give toolbar click a tick to set the flag
        requestAnimationFrame(() => {
            if (toolbarActiveRef.current) {
                toolbarActiveRef.current = false;
                return;
            }
            setIsEditing(false);
        });
    }, [setIsEditing]);

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
        <div className="relative flex min-h-[240px] w-full flex-1 flex-col gap-3">
            {isEditing ? (
                <>
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <div onMouseDown={handleToolbarMouseDown}>
                        <NotesToolbar onAction={applyAction} />
                    </div>
                    <textarea
                        ref={textareaRef}
                        value={notes}
                        onChange={(e) => onNotesChange(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        placeholder="Write your notes here…"
                        aria-label="Task notes editor"
                        className="
                            min-h-[280px] w-full flex-1 resize-none rounded-[1.4rem] border border-twilight-border/40 bg-white/[0.03] px-5 py-5 outline-none
                            font-sans text-[15px] leading-[1.75] text-twilight-text
                            placeholder:text-twilight-text-muted/90
                        "
                        maxLength={maxLength}
                    />
                </>
            ) : (
                <div
                    onClick={() => setIsEditing(true)}
                    className="prose prose-invert prose-sm min-h-[240px] max-w-none cursor-pointer rounded-[1.4rem] border border-twilight-border/40 bg-white/[0.03] px-5 py-5 prose-p:text-twilight-text prose-a:text-accent-primary prose-code:text-moonlit"
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
