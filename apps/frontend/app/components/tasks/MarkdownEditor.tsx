import React, { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
    notes: string;
    isEditing: boolean;
    setIsEditing: (editing: boolean) => void;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    maxLength?: number;
}

export function MarkdownEditor({
    notes,
    isEditing,
    setIsEditing,
    onChange,
    maxLength = 10000,
}: MarkdownEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(
                textareaRef.current.value.length,
                textareaRef.current.value.length
            );
        }
    }, [isEditing]);

    return (
        <div className="flex-1 min-h-[100px] w-full relative">
            {isEditing ? (
                <textarea
                    ref={textareaRef}
                    value={notes}
                    onChange={onChange}
                    onBlur={() => setIsEditing(false)}
                    placeholder="Write your notes here…"
                    aria-label="Task notes editor"
                    className="
                        w-full h-full min-h-[100px] bg-transparent resize-none outline-none
                        font-sans text-sm leading-relaxed text-twilight-text
                        placeholder:text-twilight-text-muted/90
                    "
                    maxLength={maxLength}
                />
            ) : (
                <div
                    onClick={() => setIsEditing(true)}
                    className="prose prose-invert prose-sm max-w-none 
                               prose-p:text-twilight-text prose-a:text-lantern prose-code:text-moonlit 
                               cursor-text min-h-[100px] w-full"
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
