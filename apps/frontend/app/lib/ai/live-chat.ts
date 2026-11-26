import { Chat } from "@ai-sdk/react";
import type { ChatInit, UIMessage } from "ai";

type Handlers = Required<Pick<ChatInit<UIMessage>, "transport" | "onFinish" | "onData" | "sendAutomaticallyWhen">>;

export const liveChatHandlers: { current: Handlers | null } = { current: null };
let slot: { owner: object; id: string; chat: Chat<UIMessage> } | null = null;

export function liveChat(owner: object, id: string): Chat<UIMessage> {
    if (slot?.owner === owner && slot.id === id) return slot.chat;
    slot?.chat.stop();
    const on = () => liveChatHandlers.current!;
    const chat = new Chat<UIMessage>({
        id,
        transport: {
            sendMessages: (options) => on().transport.sendMessages(options),
            reconnectToStream: (options) => on().transport.reconnectToStream(options),
        },
        onFinish: (event) => on().onFinish(event),
        onData: (part) => on().onData(part),
        sendAutomaticallyWhen: (options) => on().sendAutomaticallyWhen(options),
    });
    slot = { owner, id, chat };
    return chat;
}

let opened: object | null = null;

export function firstOpenFor(owner: object): boolean {
    if (opened === owner) return false;
    opened = owner;
    return true;
}
