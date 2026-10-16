import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAssistantStore } from "../../../../app/stores/assistant-store";
import { useAssistantReplyWatcher } from "../../../../app/hooks/ai/use-assistant-reply-watcher";

beforeEach(() => {
    useAssistantStore.setState({ assistantPanelOpen: false, replyUnread: false });
});

describe("useAssistantReplyWatcher", () => {
    it("clears when the panel opens in a visible tab", () => {
        useAssistantStore.setState({ replyUnread: true });
        renderHook(() => useAssistantReplyWatcher());
        expect(useAssistantStore.getState().replyUnread).toBe(true);
        act(() => useAssistantStore.setState({ assistantPanelOpen: true }));
        expect(useAssistantStore.getState().replyUnread).toBe(false);
    });
});
