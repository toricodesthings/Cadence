import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssistantStore } from "../../../../app/stores/assistant-store";

const history = vi.hoisted(() => ({ data: undefined as unknown, dataUpdatedAt: 0, read: vi.fn() }));
vi.mock("../../../../app/hooks/ai/use-conversations", () => ({
    useConversationMessages: (id: string | null) => { history.read(id); return history; },
}));

import { useAssistantReplyWatcher } from "../../../../app/hooks/ai/use-assistant-reply-watcher";

const reply = (activeStreamId: string | null) => ({ conversation: { id: "c1", activeStreamId }, messages: [] });

beforeEach(() => {
    history.data = undefined;
    history.dataUpdatedAt = 0;
    useAssistantStore.setState({ assistantPanelOpen: false, pendingReply: null, replyUnread: false });
});

describe("useAssistantReplyWatcher", () => {
    it("marks unread once a reply that was still coming lands", () => {
        useAssistantStore.getState().setPendingReply("c1");
        const since = useAssistantStore.getState().pendingReply!.since;
        const hook = renderHook(() => useAssistantReplyWatcher());
        expect(history.read).toHaveBeenLastCalledWith("c1");

        // A snapshot from before the panel closed proves nothing.
        history.data = reply(null);
        history.dataUpdatedAt = since - 1;
        hook.rerender();
        expect(useAssistantStore.getState().replyUnread).toBe(false);

        history.data = reply("s1");
        history.dataUpdatedAt = since + 1;
        hook.rerender();
        expect(useAssistantStore.getState().replyUnread).toBe(false);

        history.data = reply(null);
        history.dataUpdatedAt = since + 2;
        hook.rerender();
        expect(useAssistantStore.getState()).toMatchObject({ replyUnread: true, pendingReply: null });
    });

    it("clears when the panel opens in a visible tab", () => {
        useAssistantStore.setState({ replyUnread: true });
        renderHook(() => useAssistantReplyWatcher());
        expect(useAssistantStore.getState().replyUnread).toBe(true);
        act(() => useAssistantStore.setState({ assistantPanelOpen: true }));
        expect(useAssistantStore.getState().replyUnread).toBe(false);
        expect(history.read).toHaveBeenLastCalledWith(null);
    });
});
