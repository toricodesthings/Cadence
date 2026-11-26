import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useStickToBottom } from "use-stick-to-bottom";
import { CHAT_IMAGE_LIMITS } from "@cadence/contracts/ai";
import { ResizableSidePanel } from "../shared/ResizableSidePanel";
import { AssistantHeader } from "./AssistantHeader";
import { AssistantThread } from "./AssistantThread";
import { AssistantComposer } from "./AssistantComposer";
import { ConversationList } from "./ConversationList";
import { UsageOverlay } from "./UsageOverlay";
import { MemoryOverlay } from "./MemoryOverlay";
import { MemoryCard } from "./MemoryCard";
import { StarterPrompts } from "./AssistantThread";
import { useAssistantStore } from "../../stores/assistant-store";
import { useAssistantConversation } from "../../hooks/ai/use-assistant-conversation";
import { useChatAttachments } from "../../hooks/ai/use-chat-attachments";
import { useAiUsage } from "../../hooks/ai/use-ai-usage";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useSettings } from "../../hooks/core/use-settings";
import { useOnlineStatus } from "../../hooks/core/use-online-status";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { useStepOutOfAssistant } from "../../hooks/ai/use-step-out-of-assistant";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import { SETTINGS_DEFAULTS } from "../../types/settings";
import { describeAssistantLink, describeImageAllowance, describeUsage } from "../../lib/ai/usage";
import type { SlashCommand } from "../../lib/ai/slash-commands";

export function AssistantSidePanel({
    width,
    onWidthChange,
    isMobile = false,
}: {
    width: number;
    onWidthChange?: (width: number) => void;
    isMobile?: boolean;
}) {
    const {
        toggleAssistantPanel,
        assistantPanelOpen,
        activeConversationId,
        historyOpen,
        setHistoryOpen,
        memoryOpen,
        setMemoryOpen,
        assistantFullscreen,
        setAssistantFullscreen,
    } = useAssistantStore();
    const { isTouch, isCompact } = useShellMode();
    const canFullscreen = isMobile && isCompact && isTouch;
    const { session } = useAuthState();
    const userImage = session?.user?.image;
    const userInitial = (session?.user?.name || session?.user?.email || "U")[0]!.toUpperCase();
    const { data: settings } = useSettings();
    const assistantName = settings?.assistant?.assistantName?.trim() || SETTINGS_DEFAULTS.assistant.assistantName;
    const online = useOnlineStatus();
    const usageQuery = useAiUsage(assistantPanelOpen);
    const { data: usage } = usageQuery;
    const link = describeAssistantLink(online, usageQuery);
    const usageNotice = useMemo(() => describeUsage(usage, Date.now()), [usage]);
    const imageAllowance = useMemo(() => describeImageAllowance(usage, Date.now()), [usage]);
    const perMessage = usage?.images?.perMessage ?? CHAT_IMAGE_LIMITS.perMessage;
    const [input, setInput] = useState("");
    const [inputNotice, setInputNotice] = useState<string | null>(null);
    const [usageOpen, setUsageOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const reducedMotion = useReducedMotionSetting();
    const stick = useStickToBottom({ initial: "instant", resize: reducedMotion ? "instant" : "smooth" });
    const scrollToBottom = useCallback(
        () => void stick.scrollToBottom(reducedMotion ? "instant" : "smooth"),
        // oxlint-disable-next-line react/exhaustive-deps -- deps are deliberate here
        [stick.scrollToBottom, reducedMotion],
    );
    const images = useChatAttachments({
        conversationId: activeConversationId,
        imageAllowance,
        perMessage,
        onNotice: setInputNotice,
    });
    const conversation = useAssistantConversation({
        online,
        onNotice: setInputNotice,
        clearAttachments: images.clearAttachments,
        onTurnSubmitted: scrollToBottom,
    });
    const { isStreaming, threadTitle, handleNewChat, handleSelectConversation } = conversation;
    const submitText = (text: string) => {
        const sent = conversation.submitText(text, images.readyImages, images.uploading);
        if (sent) setInput("");
        return sent;
    };
    const stepOutOfAssistant = useStepOutOfAssistant();
    const { openSettings } = useUtilityNavigation();
    const openAssistantSettings = () => {
        stepOutOfAssistant();
        openSettings("assistant");
    };

    const closeUsage = () => {
        setUsageOpen(false);
        textareaRef.current?.focus();
    };

    const runSlashCommand = (command: SlashCommand) => {
        if (command.id === "usage") {
            setHistoryOpen(false);
            setUsageOpen(true);
        } else if (command.id === "memory") {
            setHistoryOpen(false);
            setUsageOpen(false);
            setMemoryOpen(true);
        } else if (command.id === "clear") {
            setUsageOpen(false);
            handleNewChat();
        } else if (command.id === "history") {
            setUsageOpen(false);
            setHistoryOpen(true);
        } else {
            openAssistantSettings();
        }
    };
    useEffect(() => {
        if (online) setInputNotice((n) => (n?.startsWith("You’re offline") ? null : n));
    }, [online]);

    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        let t: number | undefined;
        if (!isMobile) {
            t = window.setTimeout(() => textareaRef.current?.focus(), 140);
        }
        return () => {
            if (t) clearTimeout(t);
            opener?.focus?.();
        };
    }, [isMobile]);

    useEffect(() => {
        if (isMobile) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (memoryOpen) {
                setMemoryOpen(false);
                textareaRef.current?.focus();
            } else if (usageOpen) {
                closeUsage();
            } else if (historyOpen) {
                setHistoryOpen(false);
            } else if (assistantPanelOpen) {
                toggleAssistantPanel();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [
        isMobile,
        assistantPanelOpen,
        toggleAssistantPanel,
        historyOpen,
        setHistoryOpen,
        usageOpen,
        memoryOpen,
        setMemoryOpen,
    ]);

    const panelContent = (
        <div
            data-assistant-panel
            className={`surface-shell flex h-full flex-col ${isMobile ? "" : "photo-shell-surface"}`}
            role="dialog"
            aria-label={`${assistantName} assistant conversation`}
        >
            <AssistantHeader
                assistantName={assistantName}
                threadTitle={threadTitle}
                link={link}
                fullscreen={assistantFullscreen}
                onNewChat={handleNewChat}
                onClose={toggleAssistantPanel}
                onHistory={() => {
                    setUsageOpen(false);
                    setHistoryOpen(true);
                }}
                onToggleFullscreen={canFullscreen ? () => setAssistantFullscreen(!assistantFullscreen) : undefined}
            />
            <div className="sr-only" role="status" aria-live="polite">
                {isStreaming ? `${assistantName} is responding` : ""}
            </div>
            <MemoryCard />
            <AssistantThread
                conversation={conversation}
                assistantName={assistantName}
                userImage={userImage}
                userInitial={userInitial}
                isTouch={isTouch}
                scrollRef={stick.scrollRef}
                contentRef={stick.contentRef}
                showJump={!stick.isAtBottom}
                scrollToBottom={scrollToBottom}
            />
            {!conversation.restoring && conversation.messages.length === 0 ? (
                <StarterPrompts submitText={submitText} />
            ) : null}
            <AssistantComposer
                assistantName={assistantName}
                isTouch={isTouch}
                isMobile={isMobile}
                isStreaming={isStreaming}
                online={online}
                input={input}
                onInputChange={setInput}
                inputNotice={inputNotice}
                setInputNotice={setInputNotice}
                imageAllowance={imageAllowance}
                perMessage={perMessage}
                usageNotice={usageNotice}
                images={images}
                textareaRef={textareaRef}
                onSend={submitText}
                onStop={conversation.handleStop}
                onCommand={runSlashCommand}
            />
            <AnimatePresence>
                {historyOpen ? (
                    <ConversationList
                        activeConversationId={activeConversationId}
                        onClose={() => setHistoryOpen(false)}
                        onNewChat={handleNewChat}
                        onSelect={handleSelectConversation}
                    />
                ) : null}
            </AnimatePresence>
            <AnimatePresence>
                {usageOpen ? <UsageOverlay onClose={closeUsage} onOpenSettings={openAssistantSettings} /> : null}
            </AnimatePresence>
            <AnimatePresence>
                {memoryOpen ? (
                    <MemoryOverlay
                        onClose={() => {
                            setMemoryOpen(false);
                            textareaRef.current?.focus();
                        }}
                        onAsk={(text) => {
                            setMemoryOpen(false);
                            submitText(text);
                        }}
                    />
                ) : null}
            </AnimatePresence>
        </div>
    );

    if (isMobile) {
        return panelContent;
    }

    return (
        <ResizableSidePanel
            ariaLabel="Resize Assistant Panel"
            width={width}
            onWidthChange={onWidthChange}
            defaultWidth={360}
            minWidth={300}
            maxWidth={520}
        >
            {panelContent}
        </ResizableSidePanel>
    );
}
