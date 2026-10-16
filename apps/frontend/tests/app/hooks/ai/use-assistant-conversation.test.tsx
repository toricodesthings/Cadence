import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChatStatus, UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSATION_TITLE_DATA_TYPE } from "@cadence/contracts/ai";
import { queryKeys } from "../../../../app/lib/api/query-keys";
import { imageFilePart } from "../../../../app/lib/ai/messages";
import { liveChatHandlers } from "../../../../app/lib/ai/live-chat";
import { useAssistantStore } from "../../../../app/stores/assistant-store";

const chat = vi.hoisted(() => ({
    messages: [] as UIMessage[], status: "ready" as ChatStatus, error: undefined,
    sendMessage: vi.fn(), regenerate: vi.fn(), setMessages: vi.fn(),
    addToolApprovalResponse: vi.fn(), stop: vi.fn(), resumeStream: vi.fn(),
}));
const mocks = vi.hoisted(() => ({
    history: { data: undefined as unknown, error: null as unknown, isFetching: false, isLoading: false },
    settings: undefined as unknown,
    readHistory: vi.fn(), makeTransport: vi.fn(),
    broadcast: vi.fn(), remote: vi.fn(), refresh: vi.fn(), stopServer: vi.fn(),
}));
vi.mock("@ai-sdk/react", () => ({
    useChat: () => chat,
    Chat: class { stop() {} },
}));
vi.mock("../../../../app/hooks/ai/use-conversations", () => ({
    useConversationMessages: (id: string | null) => { mocks.readHistory(id); return mocks.history; },
}));
vi.mock("../../../../app/hooks/ai/use-conversation-broadcast", () => ({
    useConversationBroadcast: (handler: unknown) => { mocks.remote(handler); return mocks.broadcast; },
}));
vi.mock("../../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: mocks.settings }) }));
vi.mock("../../../../app/lib/ai/chat-transport", () => ({ makeChatTransport: mocks.makeTransport }));
vi.mock("../../../../app/lib/api/client", () => ({ authenticatedFetch: vi.fn() }));
vi.mock("../../../../app/lib/api/workspace-cache", () => ({ hardRefreshWorkspaceCaches: mocks.refresh }));
vi.mock("../../../../app/lib/ai/stop-stream", () => ({ stopServerStream: mocks.stopServer }));

import { useAssistantConversation } from "../../../../app/hooks/ai/use-assistant-conversation";

const user = (id = "u1", text = "Hello"): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
const snapshot = (activeStreamId: string | null = null) => ({
    conversation: { id: "conv-1", title: "A conversation", activeStreamId }, messages: [user()],
});

function setup(online = true) {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const onNotice = vi.fn();
    const clearAttachments = vi.fn();
    const onTurnSubmitted = vi.fn();
    const hook = renderHook((props: { online: boolean }) => useAssistantConversation({
        ...props, onNotice, clearAttachments, onTurnSubmitted,
    }), {
        initialProps: { online },
        wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: cache }, children),
    });
    const token = () => (mocks.makeTransport.mock.calls[0][1] as () => string)();
    const remote = (...args: unknown[]) => act(() => mocks.remote.mock.calls.at(-1)![0](...args));
    return { ...hook, cache, invalidate, onNotice, clearAttachments, token, remote };
}

beforeEach(() => {
    vi.clearAllMocks();
    chat.messages = [];
    chat.status = "ready";
    mocks.history = { data: undefined, error: null, isFetching: false, isLoading: false };
    mocks.settings = undefined;
    mocks.stopServer.mockResolvedValue(undefined);
    useAssistantStore.setState({ assistantPanelOpen: true, activeConversationId: "conv-1", replyUnread: false });
});

describe("assistant conversation lifecycle", () => {
    it("mints a thread without fetching a server row before its first send", () => {
        useAssistantStore.setState({ activeConversationId: null });
        const { result } = setup();
        expect(result.current.activeConversationId).toBeTruthy();
        expect(mocks.readHistory.mock.calls.every(([id]) => id === null)).toBe(true);
    });

    it("shows the last thread loading, never the empty welcome, until its messages are in", () => {
        mocks.history = { data: undefined, error: null, isFetching: true, isLoading: true };
        const { result, rerender } = setup();
        expect(result.current.restoring).toBe(true);
        // History landed; the chat is seeded on the next pass.
        mocks.history = { data: snapshot(), error: null, isFetching: false, isLoading: false };
        rerender({ online: true });
        expect(result.current.restoring).toBe(true);
        chat.messages = [user()];
        rerender({ online: true });
        expect(result.current.restoring).toBe(false);
    });

    it("starts a new chat on the first open when continuing the last one is off", () => {
        mocks.settings = { assistant: { resumeLastChat: false } };
        mocks.history = { data: undefined, error: null, isFetching: true, isLoading: true };
        const { result } = setup();
        expect(result.current.activeConversationId).not.toBe("conv-1");
        expect(result.current.restoring).toBe(false);
    });

    it("waits for fresh history before resuming a live stream, and resumes it once", () => {
        mocks.history = { data: snapshot("stream-1"), error: null, isFetching: true, isLoading: false };
        const { rerender } = setup();
        expect(chat.setMessages).toHaveBeenCalledWith([user()]);
        expect(chat.resumeStream).not.toHaveBeenCalled();
        mocks.history.isFetching = false;
        rerender({ online: true });
        expect(chat.resumeStream).toHaveBeenCalledTimes(1);
        mocks.history.data = snapshot("stream-1");
        rerender({ online: true });
        expect(chat.resumeStream).toHaveBeenCalledTimes(1);
    });

    it("re-seeds peer activity without resuming or broadcasting an echo", () => {
        mocks.history.data = snapshot();
        const { remote, rerender, invalidate } = setup();
        remote("stream-finished", "conv-1");
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ai.conversation("conv-1") });
        mocks.history.data = snapshot("peer-stream");
        rerender({ online: true });
        expect(chat.resumeStream).not.toHaveBeenCalled();
        chat.status = "streaming";
        rerender({ online: true });
        chat.status = "ready";
        rerender({ online: true });
        expect(mocks.broadcast).not.toHaveBeenCalled();
    });

    it("marks a reply unread when it finishes unseen, even after the panel unmounts", () => {
        const { unmount } = setup();
        const finish = (isAbort = false) =>
            liveChatHandlers.current!.onFinish({ message: user("a1"), messages: [user(), user("a1")], isAbort, isDisconnect: false, isError: false });
        finish();
        expect(useAssistantStore.getState().replyUnread).toBe(false);

        unmount();
        useAssistantStore.setState({ assistantPanelOpen: false });
        finish(true);
        expect(useAssistantStore.getState().replyUnread).toBe(false);
        finish();
        expect(useAssistantStore.getState().replyUnread).toBe(true);
    });

    it("refetches on reconnect without replaying a finished reply", () => {
        mocks.history.data = snapshot();
        const { rerender, invalidate } = setup(false);
        rerender({ online: true });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ai.conversation("conv-1") });
        mocks.history.data = snapshot();
        rerender({ online: true });
        expect(chat.resumeStream).not.toHaveBeenCalled();
    });

    it("preserves retry tokens, but gives edits a new token, anchor and the same photos", () => {
        chat.messages = [user(), { ...user("u2"), parts: [{ type: "text", text: "Photo" }, imageFilePart("11111111-1111-4111-8111-111111111111")] }];
        const { result, token, clearAttachments } = setup();
        act(() => expect(result.current.submitText("A new turn", [], false)).toBe(true));
        const sentToken = token();
        expect(clearAttachments).toHaveBeenCalledWith(false);
        act(() => result.current.handleRetry());
        expect(token()).toBe(sentToken);
        act(() => result.current.handleEdit(1, "Edited"));
        expect(token()).not.toBe(sentToken);
        expect(chat.sendMessage).toHaveBeenLastCalledWith(
            { text: "Edited", files: [imageFilePart("11111111-1111-4111-8111-111111111111")] }, { body: { editAnchorId: "u1" } },
        );
        expect(chat.setMessages.mock.calls.at(-1)![0](chat.messages)).toEqual([user()]);
    });

    it("broadcasts locally originated turns and re-seeds a completed retry", () => {
        const { result, rerender, invalidate } = setup();
        act(() => result.current.handleRetry());
        chat.status = "submitted";
        rerender({ online: true });
        chat.status = "streaming";
        rerender({ online: true });
        expect(mocks.broadcast).toHaveBeenCalledWith("stream-started", "conv-1");
        chat.status = "ready";
        rerender({ online: true });
        expect(mocks.broadcast).toHaveBeenCalledWith("stream-finished", "conv-1");
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ai.usage });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ai.conversation("conv-1") });
    });

    it("refreshes each landed write once even when onFinish repeats it", () => {
        chat.messages = [{ id: "a1", role: "assistant", parts: [
            { type: "tool-get_tasks", toolCallId: "read", state: "output-available", input: {}, output: {} },
            { type: "tool-create_tasks", toolCallId: "write", state: "output-available", input: {}, output: {} },
        ] }];
        chat.status = "streaming";
        setup();
        expect(mocks.refresh).toHaveBeenCalledTimes(1);
        act(() => liveChatHandlers.current!.onFinish({ message: chat.messages[0], messages: chat.messages, isAbort: false, isDisconnect: false, isError: false }));
        expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });

    it("stops the server before local teardown, including when the server fails", async () => {
        mocks.history.data = snapshot("stream-1");
        let rejectStop!: (error: Error) => void;
        mocks.stopServer.mockImplementationOnce(() => new Promise((_, reject) => { rejectStop = reject; }));
        const { result } = setup();
        let stopped!: Promise<void>;
        act(() => { stopped = result.current.handleStop(); });
        expect(mocks.stopServer).toHaveBeenCalledWith("conv-1", "stream-1", undefined);
        expect(chat.stop).not.toHaveBeenCalled();
        await act(async () => { rejectStop(new Error("Network lost")); await stopped; });
        expect(chat.stop).toHaveBeenCalledTimes(1);
    });

    it("applies transient titles to header and caches and announces them to peers", () => {
        const { result, cache } = setup();
        cache.setQueryData(queryKeys.ai.conversations, [{ id: "conv-1", title: null }]);
        cache.setQueryData(queryKeys.ai.conversation("conv-1"), snapshot());
        act(() => liveChatHandlers.current!.onData({
            type: CONVERSATION_TITLE_DATA_TYPE, data: { conversationId: "conv-1", title: "New title" },
        }));
        expect(result.current.threadTitle).toBe("New title");
        expect(cache.getQueryData(queryKeys.ai.conversations)).toEqual([{ id: "conv-1", title: "New title" }]);
        expect(cache.getQueryData(queryKeys.ai.conversation("conv-1"))).toMatchObject({ conversation: { title: "New title" } });
        expect(mocks.broadcast).toHaveBeenCalledWith("title-updated", "conv-1", "New title");
    });

    it("keeps outgoing messages in the cache and discards attachments when switching threads", () => {
        chat.messages = [user()];
        const { result, cache, clearAttachments } = setup();
        act(() => result.current.handleSelectConversation("conv-2"));
        expect(cache.getQueryData(queryKeys.ai.conversation("conv-1"))).toMatchObject({ messages: [user()] });
        expect(clearAttachments).toHaveBeenCalledWith(true);
        expect(useAssistantStore.getState().activeConversationId).toBe("conv-2");
    });

    it("rejects offline and uploading submissions without consuming attachments", () => {
        const { result, rerender, onNotice, clearAttachments } = setup(false);
        act(() => expect(result.current.submitText("Keep my draft", [], false)).toBe(false));
        expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("offline"));
        rerender({ online: true });
        act(() => expect(result.current.submitText("Still uploading", [], true)).toBe(false));
        expect(chat.sendMessage).not.toHaveBeenCalled();
        expect(clearAttachments).not.toHaveBeenCalled();
    });
});
