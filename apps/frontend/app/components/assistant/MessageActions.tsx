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
                className="flex h-6 w-6 items-center justify-center rounded-lg border border-twilight-border bg-twilight-elevated/80 text-twilight-text-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text cursor-pointer"
            >
                {children}
            </button>
        </Tip>
    );
}

/**
 * Action cluster for a message bubble. Always mounted (so the buttons stay in
 * the keyboard tab order) but visually revealed by the parent row's hover OR
 * focus-within via `group/msg` utilities — keyboard and touch users can reach
 * Copy / Edit / Regenerate, not just mouse users. The reveal is a CSS
 * transition, so it's silenced under the app's reduced-motion setting.
 *
 * Copy gives a transient check swap + sonner toast; Regenerate (assistant) and
 * Edit (user) are wired through from the parent.
 */
export function MessageActions({
    isUser,
    text,
    onRegenerate,
    onEdit,
}: {
    isUser: boolean;
    text: string;
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
            toast.error("Couldn't copy message");
        }
    };

    return (
        <div
            className={`flex items-center gap-1 opacity-0 translate-y-0.5 pointer-events-none transition-[opacity,transform] duration-150 group-hover/msg:pointer-events-auto group-hover/msg:translate-y-0 group-hover/msg:opacity-100 group-focus-within/msg:pointer-events-auto group-focus-within/msg:translate-y-0 group-focus-within/msg:opacity-100 ${
                isUser ? "flex-row-reverse" : "flex-row"
            }`}
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
                            <Check size={13} strokeWidth={2.5} />
                        </motion.span>
                    ) : (
                        <motion.span
                            key="copy"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={{ duration: 0.14 }}
                        >
                            <Copy size={12.5} />
                        </motion.span>
                    )}
                </AnimatePresence>
            </ActionButton>

            {!isUser && onRegenerate ? (
                <ActionButton label="Regenerate response" onClick={onRegenerate}>
                    <RotateCcw size={12.5} />
                </ActionButton>
            ) : null}

            {isUser && onEdit ? (
                <ActionButton label="Edit message" onClick={onEdit}>
                    <Pencil size={12.5} />
                </ActionButton>
            ) : null}
        </div>
    );
}
