import { useMemo, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, Sunrise, AlarmClock, Inbox } from "lucide-react";
import * as ScrollArea from "../primitives/ScrollArea";
import { ChatMessage, ChatAvatar, AssistantText } from "./MessageBubble";
import { AssistantSigil } from "./AssistantSigil";
import { ReadReceipt } from "./ReadReceipt";
import { ChatErrorBubble } from "./ChatErrorBubble";
import { ToolActivityChip } from "./ToolActivityChip";
import { ToolPart, buildSegments } from "./tool-registry";
import { imageIdsOf, messageStatus, describeThread } from "../../lib/ai/messages";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import type { AssistantConversation } from "../../hooks/ai/use-assistant-conversation";

/** Three soft bouncing dots — the "assistant is typing…" affordance. */
function TypingDots({ name }: { name: string }) {
    return (
        <span className="flex items-center gap-1 py-0.5" aria-label={`${name} is typing`}>
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-twilight-text-muted animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1s" }}
                />
            ))}
        </span>
    );
}

const STARTERS = [
    { prompt: "Plan my morning", icon: Sunrise },
    { prompt: "What’s overdue?", icon: AlarmClock },
    { prompt: "Tidy my inbox", icon: Inbox },
];

/** Errors where the same turn can go again without its images. */
const IMAGE_BLOCKED_CODES = new Set(["AI_IMAGE_LIMITED", "IMAGE_NOT_FOUND"]);

export function AssistantThread({
    conversation,
    assistantName,
    userImage,
    userInitial,
    isTouch,
    choosingMemory,
    scrollViewportRef,
    showJump,
    scrollToBottom,
    submitText
}: {
    conversation: AssistantConversation;
    assistantName: string;
    userImage?: string | null;
    userInitial: string;
    isTouch: boolean;
    choosingMemory: boolean;
    scrollViewportRef: RefObject<HTMLDivElement | null>;
    showJump: boolean;
    scrollToBottom: () => void;
    submitText: (text: string) => void;
}) {
    const { messages, status, isStreaming, handleRetry, handleEdit, regenerateLocal,
        answerApproval, replyToQuestion, streamError, imageError, sendWithoutImages, shareImages } = conversation;
    const reduceMotion = useReducedMotion();
    const { lastUserIndex, lastAssistantIndex, awaitingReply, receiptState } = useMemo(
        () => describeThread(messages, status), [messages, status],
    );
    return (
        <div inert={choosingMemory} className="relative flex min-h-0 flex-1 flex-col">
        <ScrollArea.Root className="flex-1 min-h-0">
            <ScrollArea.Viewport ref={scrollViewportRef} className={isTouch ? "px-3 py-5" : "px-4 py-6"}>
                <div className="flex flex-col gap-5">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-2 py-12 text-center">
                            <div className="mb-5 flex h-16 w-16 min-w-16 items-center justify-center rounded-full bg-accent-primary/12 text-accent-primary ring-1 ring-accent-primary/20 glow-accent">
                                <AssistantSigil size={44} />
                            </div>
                            <p className="font-display text-xl font-semibold tracking-tight text-twilight-text">
                                Say hey to {assistantName}
                            </p>
                            <p className="mt-2 max-w-[260px] text-[13px] leading-relaxed text-twilight-text-muted">
                                Drop a messy thought, ask to clear overdue items, or plan your
                                morning into tiny frictionless steps.
                            </p>
                            {/* Starter prompts — the empty screen invites the first act
                                (manifesto §0.2 law 1). Each maps to a real capability. */}
                            <div className="mt-6 grid w-full max-w-[300px] gap-2">
                                {STARTERS.map(({ prompt, icon: Icon }) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onClick={() => submitText(prompt)}
                                        className="flex min-h-11 items-center gap-3 rounded-2xl border border-white/[0.06] bg-panel-raised/60 px-4 py-2.5 text-left text-[13px] text-twilight-text-soft transition-colors hover:border-accent-primary/30 hover:bg-accent-primary/8 hover:text-twilight-text active:scale-[0.99] cursor-pointer"
                                    >
                                        <Icon size={16} className="shrink-0 text-accent-primary" aria-hidden />
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <AnimatePresence initial={false}>
                        {messages.map((message, index) => {
                            const isUser = message.role === "user";
                            const segments = buildSegments(message.parts ?? []);
                            if (!isUser && segments.length === 0) return null;
                            const text = segments
                                .flatMap((seg) => (seg.kind === "text" ? [seg.text] : []))
                                .join("\n\n");
                            const grouped = index > 0 && messages[index - 1].role === message.role;
                            const isLastAssistant = index === lastAssistantIndex;
                            const failed = messageStatus(message) === "failed";
                            // Only the latest reply can still be answered, and not mid-turn.
                            const answerable = isLastAssistant && index === messages.length - 1 && !isStreaming;

                            // Failed-turn recovery after reload (§8.3); otherwise the latest
                            // user turn carries the read receipt under its avatar.
                            const meta = isUser && failed ? (
                                <span className="text-[11px] text-twilight-text-muted">
                                    Didn’t send ·{" "}
                                    <button
                                        type="button"
                                        onClick={handleRetry}
                                        className="text-accent-primary hover:underline cursor-pointer"
                                    >
                                        Retry
                                    </button>
                                </span>
                            ) : null;
                            const receipt =
                                isUser && !failed && index === lastUserIndex ? (
                                    <ReadReceipt state={receiptState} />
                                ) : null;

                            return (
                                <div key={message.id} className={grouped ? "-mt-3" : ""}>
                                    <ChatMessage
                                        isUser={isUser}
                                        text={text}
                                        showAvatar={!grouped}
                                        latest={isUser ? index === lastUserIndex : isLastAssistant}
                                        canRegenerate={!isUser && isLastAssistant && !isStreaming}
                                        canEdit={isUser && !isStreaming}
                                        onRegenerate={() => regenerateLocal({ messageId: message.id })}
                                        onSaveEdit={(next) => handleEdit(index, next)}
                                        meta={meta}
                                        receipt={receipt}
                                        userImage={userImage}
                                        userInitial={userInitial}
                                        images={isUser ? imageIdsOf(message) : undefined}
                                    >
                                        {segments.map((seg, i) => {
                                            const approvalId = seg.kind === "card" ? seg.part.approval?.id : undefined;
                                            return (
                                                seg.kind === "text" ? (
                                                    <AssistantText key={i} text={seg.text} />
                                                ) : seg.kind === "reads" ? (
                                                    <ToolActivityChip key={i} calls={seg.calls} pending={seg.pending} />
                                                ) : (
                                                    <div key={seg.part.toolCallId || i} className="w-full">
                                                        <ToolPart
                                                            part={seg.part}
                                                            stale={!isLastAssistant}
                                                            reply={isLastAssistant && !isStreaming ? replyToQuestion : undefined}
                                                            answer={
                                                                answerable && approvalId
                                                                    ? (approved, reason) => answerApproval(approvalId, approved, reason)
                                                                    : undefined
                                                            }
                                                        />
                                                    </div>
                                                )
                                            );
                                        })}
                                    </ChatMessage>
                                </div>
                            );
                        })}
                    </AnimatePresence>

                    {/* Typed error bubble (mid-stream or pre-stream), persists in the thread */}
                    {streamError ? (
                        <ChatErrorBubble
                            error={streamError}
                            onRetry={streamError.isRetryable ? handleRetry : undefined}
                            onSendWithoutImages={imageError && IMAGE_BLOCKED_CODES.has(imageError) ? sendWithoutImages : undefined}
                            onShareImages={
                                imageError && !IMAGE_BLOCKED_CODES.has(imageError) && imageError !== "AI_RATE_LIMITED"
                                    ? shareImages
                                    : undefined
                            }
                        />
                    ) : null}

                    {/* Typing indicator while Cadence composes its reply */}
                    <AnimatePresence>
                        {awaitingReply ? (
                            <motion.div
                                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                                className="flex items-start gap-2.5"
                            >
                                <ChatAvatar />
                                <div className="rounded-[20px] rounded-tl-md border border-white/[0.06] bg-panel-raised/70 px-4 py-3.5">
                                    <TypingDots name={assistantName} />
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar>
                <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
        </ScrollArea.Root>

        <AnimatePresence>
            {showJump ? (
                <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                    onClick={() => scrollToBottom()}
                    aria-label="Jump to latest"
                    className="glass-surface absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full text-twilight-text-soft shadow-lg transition-colors hover:text-twilight-text cursor-pointer"
                >
                    <ArrowDown size={16} aria-hidden />
                </motion.button>
            ) : null}
        </AnimatePresence>
        </div>
    );
}
