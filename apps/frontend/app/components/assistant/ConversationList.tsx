import { useState } from "react";
import { Plus, AlertCircle, ChevronRight, ChevronDown } from "lucide-react";
import { AssistantSigil } from "./AssistantSigil";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as ScrollArea from "../primitives/ScrollArea";
import { Button } from "../primitives/Button";
import { OverlayPanel } from "./OverlayPanel";
import { Skeleton } from "../primitives/Skeleton";
import { useConversations } from "../../hooks/ai/use-conversations";
import {
    useRenameConversation,
    useArchiveConversation,
    useDeleteConversation,
    useSetConversationLearn,
} from "../../hooks/ai/use-conversation-mutations";
import { ConversationListItem } from "./ConversationListItem";
import { useMemoryPage } from "../../hooks/ai/use-memory";
import { ClearArchiveButton } from "./ClearArchiveButton";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";

/**
 * The saved-conversations history drawer (design §7). An in-panel surface
 * (overlaid on the thread), not a route — preserves the ambient side-panel
 * feel. Selecting a row loads its messages via the panel's `onSelect` handler.
 */
export function ConversationList({
    activeConversationId,
    onClose,
    onNewChat,
    onSelect,
}: {
    activeConversationId: string | null;
    onClose: () => void;
    onNewChat: () => void;
    onSelect: (id: string) => void;
}) {
    const reduceMotion = useReducedMotion();
    const { data: conversations, isLoading, isError, refetch } = useConversations();
    const rename = useRenameConversation();
    const archive = useArchiveConversation();
    const del = useDeleteConversation();
    const setLearn = useSetConversationLearn();
    // The per-chat switch exists only while memory is on.
    const { data: memoryPage } = useMemoryPage();
    const learnSwitch = memoryPage && !memoryPage.inactive;
    const [showArchived, setShowArchived] = useState(false);

    const active = (conversations ?? []).filter((c) => !c.archived);
    const archived = (conversations ?? []).filter((c) => c.archived);

    return (
        <OverlayPanel label="Saved conversations" title="Conversations" onClose={onClose} autoFocusBack={false} action={(
                <Button
                    variant="cardPrimary"
                    size="none"
                    onClick={onNewChat}
                    className="h-8 min-h-8 gap-1.5 rounded-full px-3 text-xs font-semibold"
                >
                    <Plus size={14} />
                    New chat
                </Button>
            )}>
            <ScrollArea.Root className="min-h-0 flex-1">
                <ScrollArea.Viewport className="px-2 py-2">
                    {isLoading ? (
                        <div className="space-y-1.5 p-1" aria-busy="true" aria-label="Loading conversations">
                            {[0, 1, 2].map((i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                                >
                                    <Skeleton className="h-4 w-40" />
                                    <Skeleton className="h-3 w-10" />
                                </div>
                            ))}
                        </div>
                    ) : isError ? (
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            className="flex w-full items-start gap-2 rounded-xl border border-twilight-border bg-twilight-surface px-3 py-3 text-left text-twilight-text-soft transition-colors hover:bg-twilight-surface-hover cursor-pointer"
                        >
                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-feedback-error" />
                            <span className="text-sm">
                                Couldn’t load your conversations. Tap to try again.
                            </span>
                        </button>
                    ) : active.length === 0 && archived.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 text-center">
                            <div className="mb-4 flex h-12 w-12 min-w-12 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/25 glow-accent">
                                <AssistantSigil size={28} />
                            </div>
                            <p className="text-sm font-medium text-twilight-text">No conversations yet</p>
                            <p className="mt-2 max-w-[240px] text-[13px] leading-relaxed text-twilight-text-muted">
                                Every chat is saved here, so you can pick any thread back up
                                right where you left it.
                            </p>
                            <Button
                                variant="cardPrimary"
                                size="none"
                                onClick={onNewChat}
                                className="mt-5 h-9 min-h-9 gap-1.5 rounded-xl px-4 text-xs font-semibold"
                            >
                                <Plus size={14} />
                                Start a chat
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-0.5 p-1">
                            {active.map((c) => (
                                <ConversationListItem
                                    key={c.id}
                                    conversation={c}
                                    active={c.id === activeConversationId}
                                    onSelect={() => onSelect(c.id)}
                                    onRename={(title) => rename.mutate({ id: c.id, title })}
                                    onArchive={(archived) => archive.mutate({ id: c.id, archived })}
                                    onDelete={() => del.mutate({ id: c.id, title: c.title?.trim() || "conversation" })}
                                    onToggleLearn={learnSwitch ? (learn) => setLearn.mutate({ id: c.id, learn }) : undefined}
                                />
                            ))}

                            {archived.length > 0 ? (
                                <div className="pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setShowArchived((v) => !v)}
                                        className="flex w-full items-center gap-1 rounded-lg px-3 py-2 text-[12px] text-twilight-text-muted transition-colors hover:text-twilight-text-soft cursor-pointer pointer-coarse:min-h-11 pointer-coarse:text-[13px]"
                                    >
                                        {showArchived ? (
                                            <ChevronDown size={14} />
                                        ) : (
                                            <ChevronRight size={14} />
                                        )}
                                        Show archived ({archived.length})
                                    </button>
                                    <AnimatePresence initial={false}>
                                        {showArchived ? (
                                            <motion.div
                                                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                                                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                                                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                                                transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                                                className="space-y-0.5 overflow-hidden"
                                            >
                                                {archived.map((c) => (
                                                    <ConversationListItem
                                                        key={c.id}
                                                        conversation={c}
                                                        active={c.id === activeConversationId}
                                                        onSelect={() => onSelect(c.id)}
                                                        onRename={(title) => rename.mutate({ id: c.id, title })}
                                                        onArchive={(archived) =>
                                                            archive.mutate({ id: c.id, archived })
                                                        }
                                                        onDelete={() => del.mutate({ id: c.id, title: c.title?.trim() || "conversation" })}
                                                        onToggleLearn={learnSwitch ? (learn) => setLearn.mutate({ id: c.id, learn }) : undefined}
                                                    />
                                                ))}
                                                <div className="flex justify-center px-2 pb-1 pt-3">
                                                    <ClearArchiveButton />
                                                </div>
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>
                                </div>
                            ) : null}
                        </div>
                    )}
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar>
                    <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
            </ScrollArea.Root>
        </OverlayPanel>
    );
}
