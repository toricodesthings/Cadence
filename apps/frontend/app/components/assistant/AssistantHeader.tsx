import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X, EllipsisVertical, Maximize2, Minimize2, SquarePen } from "lucide-react";
import { Tip } from "../primitives";
import { AssistantSigil } from "./AssistantSigil";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import type { AssistantLink } from "../../lib/ai/usage";

const LINK: Record<AssistantLink, { label: string; dot: string; text: string }> = {
    active: { label: "Active now", dot: "bg-feedback-success", text: "text-feedback-success" },
    checking: { label: "Connecting…", dot: "bg-twilight-text-muted", text: "text-twilight-text-muted" },
    offline: { label: "Offline", dot: "bg-twilight-text-muted", text: "text-twilight-text-muted" },
    error: { label: "Connection error", dot: "bg-feedback-error", text: "text-feedback-error" },
};

export function AssistantHeader({
    assistantName,
    threadTitle,
    link,
    fullscreen,
    onNewChat,
    onHistory,
    onToggleFullscreen,
    onClose,
}: {
    assistantName: string;
    threadTitle: string | null;
    link: AssistantLink;
    /** Set only where the panel can go full screen (the phone sheet). */
    fullscreen?: boolean;
    onNewChat: () => void;
    onHistory: () => void;
    onToggleFullscreen?: () => void;
    onClose: () => void;
}) {
    const reduceMotion = useReducedMotion();
    const status = LINK[link];
    // A thread's title takes the line only while the connection is fine; a problem is said instead.
    const title = link === "active" ? threadTitle : null;
    return (
        <header className="flex h-(--shell-header-h) shrink-0 items-center justify-between gap-2 border-b border-twilight-border px-3">
            <div className="flex min-w-0 items-center gap-2">
                <HeaderAction
                    label="Conversations"
                    onClick={onHistory}
                    icon={<EllipsisVertical size={20} aria-hidden />}
                />
                <div className="relative shrink-0">
                    <div className="flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-accent-primary/12 text-accent-primary ring-1 ring-accent-primary/20 glow-accent">
                        <AssistantSigil size={24} />
                    </div>
                    <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-twilight-deep ${status.dot}`}
                    />
                </div>
                {/* Name and status together are the avatar's height. */}
                <div className="flex h-9 min-w-0 flex-col justify-center">
                    <h2 className="truncate font-display text-[17px] leading-5 font-semibold tracking-tight text-twilight-text">
                        {assistantName}
                    </h2>
                    {title ? (
                        <motion.span
                            key={title}
                            initial={reduceMotion ? false : { opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                            className="block truncate text-[11px] leading-4 font-medium text-twilight-text-muted"
                        >
                            {title}
                        </motion.span>
                    ) : (
                        <span role="status" className={`text-[11px] leading-4 font-medium ${status.text}`}>
                            {status.label}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <HeaderAction label="New chat" onClick={onNewChat} icon={<SquarePen size={20} aria-hidden />} />
                {onToggleFullscreen ? (
                    <HeaderAction
                        label={fullscreen ? "Exit full screen" : "Full screen"}
                        onClick={onToggleFullscreen}
                        icon={fullscreen ? <Minimize2 size={20} aria-hidden /> : <Maximize2 size={20} aria-hidden />}
                    />
                ) : null}
                <HeaderAction label="Close assistant" onClick={onClose} icon={<X size={20} aria-hidden />} />
            </div>
        </header>
    );
}

function HeaderAction({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
    return (
        <Tip label={label} side="bottom">
            {/* 44px with a 20px icon, as every sheet's X: a squircle on a mouse, the phone's glass circle on touch. */}
            <button
                type="button"
                onClick={onClick}
                aria-label={label}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text cursor-pointer"
            >
                {icon}
            </button>
        </Tip>
    );
}
