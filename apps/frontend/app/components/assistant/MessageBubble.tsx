import React, { useEffect, useRef, useState } from "react";
import { Copy, Pencil, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import * as ContextMenu from "../primitives/ContextMenu";
import { Markdown } from "./Markdown";
import { MessageActions } from "./MessageActions";
import { AssistantSigil } from "./AssistantSigil";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";

/** Conversation avatar — the sigil for the assistant, the signed-in user's photo
 * (or initial) for them. `min-w-8` is load-bearing: without it a flex child's
 * automatic minimum resolves to the image's intrinsic size and it balloons. */
export function ChatAvatar({ userImage, userInitial }: { userImage?: string | null; userInitial?: string } = {}) {
    if (userInitial !== undefined) {
        return (
            <div className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-primary/15 ring-1 ring-white/10">
                {userImage ? (
                    <img src={userImage} alt="" className="block h-full w-full object-cover" />
                ) : (
                    <span className="font-display text-[12px] font-semibold text-accent-primary">{userInitial}</span>
                )}
            </div>
        );
    }
    return (
        <div className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-accent-primary/12 text-accent-primary ring-1 ring-accent-primary/20 glow-accent">
            <AssistantSigil size={20} />
        </div>
    );
}

/** One run of assistant prose — a glass card in the panel's own surface tone. */
export function AssistantText({ text }: { text: string }) {
    return (
        <div className="w-fit max-w-full rounded-[20px] rounded-tl-md border border-white/[0.06] bg-panel-raised/70 px-4 py-3 text-[14px] leading-relaxed text-twilight-text-soft shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)]">
            <Markdown>{text}</Markdown>
        </div>
    );
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    } catch {
        toast.error("Couldn’t copy message");
    }
}

/**
 * One chat turn. The user's turn is a right-aligned accent bubble (with inline
 * edit); the assistant's is its sigil + an ordered stack of `children` (prose,
 * tool activity, proposal cards — in the order they happened).
 *
 * Actions sit IN FLOW under the whole turn, after any tool chip or card, so they
 * never overlap what follows and always leave the turn room to breathe. On touch,
 * a long-press opens the same actions as a menu; only the latest reply keeps its
 * row visible there.
 */
export function ChatMessage({
    isUser,
    text,
    children,
    showAvatar = true,
    latest = false,
    canRegenerate,
    canEdit,
    onRegenerate,
    onSaveEdit,
    meta,
    receipt,
    userImage,
    userInitial = "U",
}: {
    isUser: boolean;
    /** Plain text of the turn — what Copy copies and Edit starts from. */
    text: string;
    /** Assistant turn body (ignored for the user, whose bubble renders `text`). */
    children?: React.ReactNode;
    showAvatar?: boolean;
    /** The newest turn of its role — its actions stay visible. */
    latest?: boolean;
    canRegenerate?: boolean;
    canEdit?: boolean;
    onRegenerate?: () => void;
    onSaveEdit?: (next: string) => void;
    /** Trailing slot on the action row (failed-send retry). */
    meta?: React.ReactNode;
    /** Read receipt, shown under the user's avatar. */
    receipt?: React.ReactNode;
    userImage?: string | null;
    userInitial?: string;
}) {
    const reduceMotion = useReducedMotion();
    const coarse = useIsCoarsePointer();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(text);
    const editRef = useRef<HTMLTextAreaElement>(null);

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

    const regenerate = canRegenerate ? onRegenerate : undefined;
    const edit = canEdit ? () => setEditing(true) : undefined;
    // Touch reaches actions by long-press; only the latest reply keeps a row.
    const showRow = !editing && (!coarse || (latest && !isUser)) && (text.length > 0 || meta);

    const body = isUser ? (
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-md border border-accent-primary/20 bg-accent-primary/18 px-4 py-2.5 text-[14px] leading-relaxed text-twilight-text shadow-[0_10px_30px_-18px_color-mix(in_srgb,var(--accent-primary)_60%,transparent)]">
            {text}
        </div>
    ) : (
        <div className="flex min-w-0 flex-col items-start gap-2">{children}</div>
    );

    const editor = (
        <div className="w-full rounded-[20px] border border-accent-primary/40 bg-panel-raised px-3.5 py-2.5 shadow-sm">
            <textarea
                ref={editRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        setEditing(false);
                    } else if (e.key === "Enter" && !e.shiftKey && !coarse) {
                        e.preventDefault();
                        commitEdit();
                    }
                }}
                rows={1}
                className={`max-h-[200px] w-full resize-none bg-transparent leading-relaxed text-twilight-text focus:outline-none ${coarse ? "text-base" : "text-[14px]"}`}
                aria-label="Edit your message"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="min-h-8 rounded-full px-3 text-[12px] font-medium text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={commitEdit}
                    className="min-h-8 rounded-full bg-accent-primary/20 px-3 text-[12px] font-semibold text-accent-primary transition-colors hover:bg-accent-primary/30 cursor-pointer"
                >
                    Save &amp; send
                </button>
            </div>
        </div>
    );

    return (
        <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}
            className={`group/msg flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
        >
            {!isUser ? (
                showAvatar ? <ChatAvatar /> : <div className="w-8 min-w-8 shrink-0" aria-hidden />
            ) : null}

            <div className={`flex min-w-0 flex-col gap-1.5 ${isUser ? "flex-1 items-end" : "flex-1 items-start"}`}>
                {editing ? (
                    editor
                ) : (
                    // Long-press (touch only — desktop keeps the native right-click
                    // for copying a selection) lifts the turn and opens its actions.
                    <ContextMenu.Root
                        onOpenChange={(open) => {
                            if (open) navigator.vibrate?.(8);
                        }}
                    >
                        <ContextMenu.Trigger
                            disabled={!coarse || !text}
                            className={`flex w-full min-w-0 transition-transform duration-200 ${isUser ? "justify-end" : "justify-start"} ${
                                coarse ? "select-none [-webkit-touch-callout:none] data-[state=open]:scale-[0.97]" : ""
                            }`}
                        >
                            {body}
                        </ContextMenu.Trigger>
                        <ContextMenu.Content className="min-w-[210px]">
                            <ContextMenu.Item onSelect={() => void copyText(text)} className="gap-3">
                                <Copy size={16} aria-hidden /> Copy
                            </ContextMenu.Item>
                            {edit ? (
                                <ContextMenu.Item onSelect={edit} className="gap-3">
                                    <Pencil size={16} aria-hidden /> Edit message
                                </ContextMenu.Item>
                            ) : null}
                            {regenerate ? (
                                <ContextMenu.Item onSelect={regenerate} className="gap-3">
                                    <RotateCcw size={16} aria-hidden /> Regenerate
                                </ContextMenu.Item>
                            ) : null}
                        </ContextMenu.Content>
                    </ContextMenu.Root>
                )}

                {showRow ? (
                    <div className={`flex min-h-7 items-center gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
                        {text ? (
                            <MessageActions
                                isUser={isUser}
                                text={text}
                                pinned={latest && !isUser}
                                onRegenerate={regenerate}
                                onEdit={edit}
                            />
                        ) : null}
                        {meta}
                    </div>
                ) : meta ? (
                    <div className="flex justify-end">{meta}</div>
                ) : null}
            </div>

            {isUser ? (
                <div className="flex w-8 min-w-8 shrink-0 flex-col items-center gap-1.5">
                    {showAvatar ? <ChatAvatar userImage={userImage} userInitial={userInitial} /> : null}
                    {receipt}
                </div>
            ) : null}
        </motion.div>
    );
}
