import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X, Brain, History, SquarePen } from "lucide-react";
import { Tip } from "../primitives";
import { AssistantSigil } from "./AssistantSigil";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";

export function AssistantHeader({
    assistantName,
    threadTitle,
    choosingMemory,
    hasMemory,
    onNewChat,
    onHistory,
    onMemory,
    onClose
}: {
    assistantName: string;
    threadTitle: string | null;
    choosingMemory: boolean;
    hasMemory: boolean;
    onNewChat: () => void;
    onHistory: () => void;
    onMemory: () => void;
    onClose: () => void;
}) {
    const reduceMotion = useReducedMotion();
    return (
        <header inert={choosingMemory} className="flex h-(--shell-header-h) shrink-0 items-center justify-between border-b border-twilight-border px-4">
            <div className="flex items-center gap-3">
                <div className="relative">
                    <div className="flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-accent-primary/12 text-accent-primary ring-1 ring-accent-primary/20 glow-accent">
                        <AssistantSigil size={24} />
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-feedback-success ring-2 ring-twilight-deep" />
                </div>
                <div className="min-w-0 leading-tight">
                    <h2 className="font-display text-lg font-semibold tracking-tight text-twilight-text">
                        {assistantName}
                    </h2>
                    {threadTitle ? (
                        <motion.span
                            key={threadTitle}
                            initial={reduceMotion ? false : { opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                            className="block max-w-[220px] truncate text-[11px] font-medium text-twilight-text-muted"
                            title={threadTitle}
                        >
                            {threadTitle}
                        </motion.span>
                    ) : (
                        <span className="text-[11px] font-medium text-feedback-success">
                            Active now
                        </span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1">
                <HeaderAction label="New chat" onClick={onNewChat} icon={<SquarePen size={17} aria-hidden />} />
                <HeaderAction label="Conversation history" tip="Conversations" onClick={onHistory} icon={<History size={17} aria-hidden />} />
                {hasMemory ? <HeaderAction label="What Cadence knows" onClick={onMemory} icon={<Brain size={17} aria-hidden />} /> : null}
                <HeaderAction label="Close assistant" onClick={onClose} icon={<X size={18} aria-hidden />} />
            </div>
        </header>
    );
}

function HeaderAction({ label, tip = label, onClick, icon }: {
    label: string;
    tip?: string;
    onClick: () => void;
    icon: ReactNode;
}) {
    return (
        <Tip label={tip} side="bottom">
            <button onClick={onClick} aria-label={label}
                className="flex h-9 w-9 items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text cursor-pointer">
                {icon}
            </button>
        </Tip>
    );
}
