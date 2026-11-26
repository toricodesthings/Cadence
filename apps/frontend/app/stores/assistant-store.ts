import { newRowId } from "../lib/api/optimistic-id";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ApprovalMode, ChatSurface } from "@cadence/contracts/ai";

interface AssistantState {
    pendingMessage: string | null;
    requestMessage: (message: string) => void;
    clearPendingMessage: () => void;
    assistantPanelOpen: boolean;
    assistantPanelWidth: number;
    activeConversationId: string | null;
    historyOpen: boolean;
    memoryOpen: boolean;
    approvalMode: ApprovalMode;
    surface: ChatSurface | null;
    setSurface: (surface: ChatSurface | null) => void;
    replyUnread: boolean;
    setReplyUnread: (unread: boolean) => void;
    assistantFullscreen: boolean;
    setAssistantFullscreen: (fullscreen: boolean) => void;
    toggleAssistantPanel: () => void;
    setAssistantPanelOpen: (open: boolean) => void;
    setAssistantPanelWidth: (width: number) => void;
    startNewConversation: () => void;
    setActiveConversation: (id: string) => void;
    setHistoryOpen: (open: boolean) => void;
    setMemoryOpen: (open: boolean) => void;
    setApprovalMode: (mode: ApprovalMode) => void;
}

export const useAssistantStore = create<AssistantState>()(
    persist(
        (set) => ({
            pendingMessage: null,
            requestMessage: (pendingMessage) => set({ pendingMessage, assistantPanelOpen: true }),
            clearPendingMessage: () => set({ pendingMessage: null }),
            assistantPanelOpen: false,
            assistantPanelWidth: 340,
            activeConversationId: null,
            historyOpen: false,
            memoryOpen: false,
            approvalMode: "ask",
            surface: null,
            setSurface: (surface) => set({ surface }),
            replyUnread: false,
            setReplyUnread: (replyUnread) => set({ replyUnread }),
            assistantFullscreen: false,
            setAssistantFullscreen: (assistantFullscreen) => set({ assistantFullscreen }),
            toggleAssistantPanel: () =>
                set((s) => ({ assistantPanelOpen: !s.assistantPanelOpen, assistantFullscreen: false })),
            setAssistantPanelOpen: (open) =>
                set(open ? { assistantPanelOpen: true } : { assistantPanelOpen: false, assistantFullscreen: false }),
            setAssistantPanelWidth: (width) => set({ assistantPanelWidth: width }),
            startNewConversation: () => set({ activeConversationId: newRowId(), historyOpen: false }),
            setActiveConversation: (id) => set({ activeConversationId: id, historyOpen: false }),
            setHistoryOpen: (open) => set({ historyOpen: open }),
            setMemoryOpen: (open) => set(open ? { memoryOpen: true, assistantPanelOpen: true } : { memoryOpen: false }),
            setApprovalMode: (mode) => set({ approvalMode: mode }),
        }),
        {
            name: "cadence-assistant-panel",
            version: 1,
            migrate: (persisted, version) => {
                const { autoApprove, ...rest } = (persisted ?? {}) as { autoApprove?: boolean };
                return version < 1 ? { ...rest, approvalMode: autoApprove ? "auto" : "ask" } : rest;
            },
            partialize: (state) => ({
                assistantPanelOpen: state.assistantPanelOpen,
                assistantPanelWidth: state.assistantPanelWidth,
                activeConversationId: state.activeConversationId,
                approvalMode: state.approvalMode,
                replyUnread: state.replyUnread,
            }),
        },
    ),
);
