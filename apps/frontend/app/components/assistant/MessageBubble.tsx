import React, { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Markdown } from "./Markdown";
import { MessageActions } from "./MessageActions";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Conversation avatar — Cadence on the assistant side, the signed-in user on
 * theirs. `min-w-7` is load-bearing: the container is a flex child, so without
 * an explicit min-width its automatic minimum resolves to the image's intrinsic
 * size and the avatar balloons to full resolution. */
export function ChatAvatar({
    isUser,
    userImage,
    userInitial,
}: {
    isUser: boolean;
    userImage?: string | null;
    userInitial: string;
}) {
    if (isUser) {
        return (
            <div className="flex h-7 w-7 min-w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-primary/15 ring-1 ring-twilight-border">
                {userImage ? (
                    <img src={userImage} alt="" className="block h-full w-full object-cover" />
                ) : (
                    <span className="font-display text-[11px] font-semibold text-accent-primary">
                        {userInitial}
                    </span>
                )}
            </div>
        );
    }
    return (
        <div className="flex h-7 w-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/25 glow-lantern">
            <Sparkles size={14} />
        </div>
    );
}

/**
 * A single chat row: avatar + bubble, with hover-revealed actions and an
 * optional inline-edit mode for user messages.
 *
 * Row alignment follows the codebase convention: user → justify-end with the
 * avatar AFTER the bubble; assistant → justify-start with the avatar BEFORE.
 * `flex-row-reverse` is deliberately avoided.
 */
export function MessageBubble({
    text,
    isUser,
    userImage,
    userInitial,
    showAvatar,
    canRegenerate,
    canEdit,
    onRegenerate,
    onSaveEdit,
}: {
    text: string;
    isUser: boolean;
    userImage?: string | null;
    userInitial: string;
    showAvatar: boolean;
    canRegenerate?: boolean;
    canEdit?: boolean;
    onRegenerate?: () => void;
    onSaveEdit?: (next: string) => void;
}) {
    const reduceMotion = useReducedMotion();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(text);
    const editRef = useRef<HTMLTextAreaElement>(null);

    // Enter edit mode prefilled + focused; auto-grow the textarea.
    useEffect(() => {
        if (!editing) return;
        setDraft(text);
        const el = editRef.current;
        if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        }
    }, [editing, text]);

    useEffect(() => {
        const el = editRef.current;
        if (!el || !editing) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, [draft, editing]);

    const commitEdit = () => {
        const next = draft.trim();
        if (next && next !== text) onSaveEdit?.(next);
        setEditing(false);
    };

    const enter = reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, y: 10 };
    const settled = reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 };

    const bubbleBase =
        "max-w-full whitespace-normal break-words px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm";
    const bubbleSkin = isUser
        ? "rounded-2xl rounded-br-md bg-accent-primary/20 text-twilight-text"
        : "rounded-2xl rounded-bl-md border border-twilight-border bg-twilight-surface text-twilight-text-soft";

    return (
        <motion.div
            initial={enter}
            animate={settled}
            transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}
            className={`group/msg flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
        >
            {/* Assistant avatar sits before the bubble. A spacer keeps grouped
                messages aligned when the avatar is hidden. */}
            {!isUser ? (
                showAvatar ? (
                    <ChatAvatar isUser={false} userInitial={userInitial} />
                ) : (
                    <div className="h-7 w-7 min-w-7 shrink-0" aria-hidden />
                )
            ) : null}

            <div className={`flex max-w-[80%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
                {editing ? (
                    <div className="w-full min-w-[200px] rounded-2xl border border-accent-primary/40 bg-twilight-surface px-3 py-2 shadow-sm">
                        <textarea
                            ref={editRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    e.preventDefault();
                                    setEditing(false);
                                } else if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    commitEdit();
                                }
                            }}
                            rows={1}
                            className="max-h-[200px] w-full resize-none bg-transparent text-[14px] leading-relaxed text-twilight-text focus:outline-none"
                            aria-label="Edit your message"
                        />
                        <div className="mt-2 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={commitEdit}
                                className="rounded-lg bg-accent-primary/20 px-2.5 py-1 text-[12px] font-semibold text-accent-primary transition-colors hover:bg-accent-primary/30 cursor-pointer"
                            >
                                Save &amp; send
                            </button>
                        </div>
                        <p className="mt-1 text-right text-[10px] text-twilight-text-muted">
                            Enter to send · Esc to cancel
                        </p>
                    </div>
                ) : (
                    <div className="relative">
                        <div className={`${bubbleBase} ${bubbleSkin}`}>
                            <Markdown>{text}</Markdown>
                        </div>
                        {/* Actions float out of flow (absolute) so revealing them on hover
                            never grows the column and reflows the thread below. The cluster
                            stays a DOM descendant of the hovered row, so the pointer can
                            travel onto it without dropping the hover. */}
                        <div className={`absolute top-full z-10 pt-1 ${isUser ? "right-1" : "left-1"}`}>
                            <MessageActions
                                isUser={isUser}
                                text={text}
                                onRegenerate={canRegenerate ? onRegenerate : undefined}
                                onEdit={canEdit ? () => setEditing(true) : undefined}
                            />
                        </div>
                    </div>
                )}
            </div>

            {isUser ? <ChatAvatar isUser userImage={userImage} userInitial={userInitial} /> : null}
        </motion.div>
    );
}
