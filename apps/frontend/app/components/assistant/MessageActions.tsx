import React, { useState } from "react";
import { Copy, Check, RotateCcw, Pencil } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Tip } from "../primitives";

function ActionButton({
    label,
    onClick,
    children,
}: {
    label: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Tip label={label} side="top">
            <button
                type="button"
                onClick={onClick}
                aria-label={label}
                className="flex h-7 w-7 items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text [@media(hover:none)]:h-9 [@media(hover:none)]:w-9 cursor-pointer"
            >
                {children}
            </button>
        </Tip>
    );
}

/**
 * Action row under a chat turn. Always mounted and in flow (so the buttons stay
 * in the keyboard tab order and never overlap what follows) but revealed by the
 * turn's hover OR focus-within via `group/msg` utilities; `pinned` keeps it
 * visible (the latest reply). The reveal is a CSS transition, so it's silenced
 * under the app's reduced-motion setting.
 *
 * Copy gives a transient check swap + sonner toast; Regenerate (assistant) and
 * Edit (user) are wired through from the parent.
 */
export function MessageActions({
    isUser,
    text,
    pinned,
    onRegenerate,
    onEdit,
}: {
    isUser: boolean;
    text: string;
    /** Always visible, not just on hover. */
    pinned?: boolean;
    onRegenerate?: () => void;
    onEdit?: () => void;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success("Copied to clipboard");
            window.setTimeout(() => setCopied(false), 1400);
        } catch {
            toast.error("Couldn’t copy message");
        }
    };

    return (
        <div
            className={`flex items-center gap-0.5 transition-[opacity,transform] duration-150 ${
                pinned
                    ? ""
                    : "opacity-0 translate-y-0.5 pointer-events-none group-hover/msg:pointer-events-auto group-hover/msg:translate-y-0 group-hover/msg:opacity-100 group-focus-within/msg:pointer-events-auto group-focus-within/msg:translate-y-0 group-focus-within/msg:opacity-100"
            } ${isUser ? "flex-row-reverse" : "flex-row"}`}
        >
            <ActionButton label="Copy message" onClick={handleCopy}>
                <AnimatePresence mode="wait" initial={false}>
                    {copied ? (
                        <motion.span
                            key="check"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={{ duration: 0.14 }}
                            className="text-feedback-success"
                        >
                            <Check size={14} strokeWidth={2.5} />
                        </motion.span>
                    ) : (
                        <motion.span
                            key="copy"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={{ duration: 0.14 }}
                        >
                            <Copy size={14} />
                        </motion.span>
                    )}
                </AnimatePresence>
            </ActionButton>

            {!isUser && onRegenerate ? (
                <ActionButton label="Regenerate response" onClick={onRegenerate}>
                    <RotateCcw size={14} />
                </ActionButton>
            ) : null}

            {isUser && onEdit ? (
                <ActionButton label="Edit message" onClick={onEdit}>
                    <Pencil size={14} />
                </ActionButton>
            ) : null}
        </div>
    );
}
