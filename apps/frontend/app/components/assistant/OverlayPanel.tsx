import type { ReactNode, Ref } from "react";
import { ChevronLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Tip } from "../primitives";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";

interface OverlayPanelProps {
    label: string;
    title: string;
    onClose: () => void;
    action?: ReactNode;
    backRef?: Ref<HTMLButtonElement>;
    autoFocusBack?: boolean;
    className?: string;
    children: ReactNode;
}

export function OverlayPanel({
    label,
    title,
    onClose,
    action,
    backRef,
    autoFocusBack = true,
    className = "bg-panel",
    children,
}: OverlayPanelProps) {
    const reduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className={`absolute inset-0 z-10 flex flex-col ${className}`}
            role="dialog"
            aria-label={label}
        >
            <header className="flex h-(--shell-header-h) shrink-0 items-center justify-between border-b border-twilight-border px-4">
                <div className="flex items-center gap-2">
                    <Tip label="Back to conversation" side="bottom">
                        <button
                            type="button"
                            ref={backRef}
                            onClick={onClose}
                            autoFocus={autoFocusBack}
                            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                            aria-label="Back to conversation"
                        >
                            <ChevronLeft size={20} aria-hidden />
                        </button>
                    </Tip>
                    <h2 className="font-display text-lg font-semibold tracking-tight text-twilight-text">{title}</h2>
                </div>
                {action}
            </header>
            {children}
        </motion.div>
    );
}
