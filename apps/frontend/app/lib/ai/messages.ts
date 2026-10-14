import type { ChatStatus, UIMessage } from "ai";
import { CHAT_IMAGE_MEDIA_TYPE, chatImageUrl, parseChatImageUrl } from "@cadence/contracts/ai";

/** Image ids a message's file parts reference. */
export function imageIdsOf(message: UIMessage): string[] {
    return message.parts.flatMap((part) => {
        const id = part.type === "file" ? parseChatImageUrl(part.url) : null;
        return id ? [id] : [];
    });
}

/** The file part a chat turn carries for an uploaded image: a reference, never bytes or a filename. */
export const imageFilePart = (id: string) => ({ type: "file" as const, mediaType: CHAT_IMAGE_MEDIA_TYPE, url: chatImageUrl(id) });

/** The `status` metadata a persisted assistant turn may carry (§8.3). */
export function messageStatus(message: UIMessage): string | undefined {
    const meta = message.metadata;
    if (!meta || typeof meta !== "object" || !("status" in meta)) return undefined;
    return typeof meta?.status === "string" ? meta.status : undefined;
}

/** Only static tool parts participate in Cadence's tool registry. */
export type AssistantToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export function isAssistantToolPart(part: UIMessage["parts"][number]): part is AssistantToolPart {
    return part.type.startsWith("tool-");
}

export function lastMessageIndex(messages: readonly UIMessage[], role: UIMessage["role"]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === role) return i;
    }
    return -1;
}

/** Receipts reflect actual reply parts; typing remains until visible reply text arrives. */
export function describeThread(messages: readonly UIMessage[], status: ChatStatus) {
    const lastUserIndex = lastMessageIndex(messages, "user");
    const lastAssistantIndex = lastMessageIndex(messages, "assistant");
    let hasText = false;
    let replyStarted = false;
    if (lastUserIndex >= 0) {
        for (const message of messages.slice(lastUserIndex + 1)) {
            if (message.role !== "assistant") continue;
            for (const part of message.parts) {
                if (part.type === "text" && part.text) {
                    hasText = true;
                    replyStarted = true;
                }
                if (part.type === "reasoning" || isAssistantToolPart(part)) replyStarted = true;
            }
        }
    }
    const receiptState = replyStarted ? "read" : status === "streaming" ? "delivered" : "sent";
    return {
        lastUserIndex, lastAssistantIndex, receiptState,
        awaitingReply: (status === "submitted" || status === "streaming") && !hasText,
    } as const;
}
