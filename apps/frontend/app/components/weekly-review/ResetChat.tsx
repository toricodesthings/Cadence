import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { CalendarRange, Flag, Gauge, MoveRight, Sunrise, Target } from "lucide-react";
import { CHAT_IMAGE_LIMITS } from "@cadence/contracts/ai";
import { AssistantThread } from "../assistant/AssistantThread";
import { AssistantComposer } from "../assistant/AssistantComposer";
import { AssistantSigil } from "../assistant/AssistantSigil";
import { useAssistantStore } from "../../stores/assistant-store";
import { useAssistantConversation } from "../../hooks/ai/use-assistant-conversation";
import { useChatAttachments } from "../../hooks/ai/use-chat-attachments";
import { useAiUsage } from "../../hooks/ai/use-ai-usage";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useSettings } from "../../hooks/core/use-settings";
import { useOnlineStatus } from "../../hooks/core/use-online-status";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import { useDeviceValue } from "../../hooks/ui/use-device-flag";
import { SETTINGS_DEFAULTS } from "../../types/settings";
import { describeImageAllowance, describeUsage } from "../../lib/ai/usage";
import type { SlashCommand } from "../../lib/ai/slash-commands";

/** The Huddle's one conversation, kept on this device so leaving and coming back resumes it; Done clears it. */
export const RESET_CHAT_KEY = "cadence-weekly-reset-chat";

const STARTERS = [
    { label: "Spread my week", icon: CalendarRange, text: "Spread this week's tasks into my free time" },
    { label: "What's due?", icon: Flag, text: "What's due this week?" },
    { label: "Lighten a day", icon: MoveRight, text: "My busiest day is too full, what can move?" },
    { label: "Plan tomorrow", icon: Sunrise, text: "Plan tomorrow for me" },
    { label: "Am I overbooked?", icon: Gauge, text: "Is any day this week overbooked?" },
    { label: "Find focus time", icon: Target, text: "Find me a 90-minute focus block this week" },
] as const;

/**
 * The Huddle step: just the assistant, the assistant panel's thread and composer, embedded. The greeting is the app's own
 * (no model call); a starter chip sends its words as a normal message. Typing nothing costs nothing.
 */
export function ResetChat() {
    const [savedId, saveId] = useDeviceValue(RESET_CHAT_KEY);
    const { activeConversationId, setSurface, setAssistantPanelOpen, setHistoryOpen, setMemoryOpen } = useAssistantStore();
    const { isTouch, isCompact } = useShellMode();
    const { session } = useAuthState();
    const { data: settings } = useSettings();
    const assistantName = settings?.assistant?.assistantName?.trim() || SETTINGS_DEFAULTS.assistant.assistantName;
    const online = useOnlineStatus();
    const { data: usage } = useAiUsage(true);
    const usageNotice = useMemo(() => describeUsage(usage, Date.now()), [usage]);
    const imageAllowance = useMemo(() => describeImageAllowance(usage, Date.now()), [usage]);
    const [input, setInput] = useState("");
    const [inputNotice, setInputNotice] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const reducedMotion = useReducedMotionSetting();
    const stick = useStickToBottom({ initial: "instant", resize: reducedMotion ? "instant" : "smooth" });
    const { scrollToBottom: stickToBottom } = stick;
    const scrollToBottom = useCallback(() => void stickToBottom(reducedMotion ? "instant" : "smooth"), [stickToBottom, reducedMotion]);
    const images = useChatAttachments({ conversationId: activeConversationId, imageAllowance, perMessage: usage?.images?.perMessage ?? CHAT_IMAGE_LIMITS.perMessage, onNotice: setInputNotice });
    const conversation = useAssistantConversation({ online, onNotice: setInputNotice, clearAttachments: images.clearAttachments, onTurnSubmitted: scrollToBottom, open: true });
    const { openSettings } = useUtilityNavigation();

    // One thread on screen: the side panel closes while the reset owns the chat, and each turn says it's the reset's.
    useEffect(() => {
        setAssistantPanelOpen(false);
        setSurface("weekly_reset");
        return () => setSurface(null);
    }, [setAssistantPanelOpen, setSurface]);

    // Resume the reset's thread, or start one; whichever id ends up active (a 404 mints a new one) is the one kept.
    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        if (savedId && savedId !== activeConversationId) conversation.handleSelectConversation(savedId);
        else if (!savedId) conversation.handleNewChat();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount
    useEffect(() => {
        if (started.current && activeConversationId) saveId(activeConversationId);
    }, [activeConversationId, saveId]);

    const submitText = (text: string) => {
        const sent = conversation.submitText(text, images.readyImages, images.uploading);
        if (sent) setInput("");
        return sent;
    };
    // The overlays live in the panel: those commands open it there.
    const runSlashCommand = (command: SlashCommand) => {
        if (command.id === "clear") conversation.handleNewChat();
        else if (command.id === "settings") openSettings("assistant");
        else {
            if (command.id === "memory") setMemoryOpen(true);
            if (command.id === "history") setHistoryOpen(true);
            setAssistantPanelOpen(true);
        }
    };

    const greeting = (
        <div className="flex flex-col gap-4 px-1 py-2">
            <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-accent-primary/12 text-accent-primary">
                    <AssistantSigil size={26} />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-twilight-text-soft">{assistantName}</p>
                    <p className="text-[0.9375rem] text-twilight-text">Anything to shuffle before the week starts?</p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {STARTERS.map(({ label, icon: Icon, text }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => submitText(text)}
                        className="surface-control inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium text-twilight-text-soft hover:text-twilight-text"
                    >
                        <Icon size={15} aria-hidden="true" className="text-accent-primary" /> {label}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="surface-card flex h-[max(24rem,calc(100dvh-16rem))] flex-col overflow-hidden rounded-3xl" role="region" aria-label={`${assistantName}, Weekly Reset chat`}>
            <div className="sr-only" role="status" aria-live="polite">{conversation.isStreaming ? `${assistantName} is responding` : ""}</div>
            <AssistantThread conversation={conversation} assistantName={assistantName}
                userImage={session?.user?.image} userInitial={(session?.user?.name || session?.user?.email || "U")[0]!.toUpperCase()} isTouch={isTouch}
                scrollRef={stick.scrollRef} contentRef={stick.contentRef}
                showJump={!stick.isAtBottom} scrollToBottom={scrollToBottom} submitText={submitText} empty={greeting} />
            <AssistantComposer assistantName={assistantName} isTouch={isTouch} isMobile={isCompact}
                isStreaming={conversation.isStreaming} online={online}
                input={input} onInputChange={setInput} inputNotice={inputNotice} setInputNotice={setInputNotice} imageAllowance={imageAllowance}
                perMessage={usage?.images?.perMessage ?? CHAT_IMAGE_LIMITS.perMessage} usageNotice={usageNotice} images={images} textareaRef={textareaRef}
                onSend={submitText} onStop={conversation.handleStop} onCommand={runSlashCommand} />
        </div>
    );
}
