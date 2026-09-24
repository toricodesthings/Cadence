import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ApprovalMode } from "@cadence/contracts/ai";

interface AssistantState {
    pendingMessage: string | null;
    requestMessage: (message: string) => void;
    clearPendingMessage: () => void;
    assistantPanelOpen: boolean;
    assistantPanelWidth: number;
    /**
     * Client-owned conversation id (ai_frontend.md §5.3). Minted with
     * `crypto.randomUUID()` on a new chat; the backend create-if-absent
     * materializes it on the first turn. Persisted so reopening the panel
     * resumes the last thread.
     */
    activeConversationId: string | null;
    /** History drawer visibility (in-panel collapsible, not a route). */
    historyOpen: boolean;
    /**
     * Approval mode. ask (default): every proposal waits for the user's confirm.
     * auto: proposals from a live turn commit themselves, except permanent deletes.
     * full: every proposal from a live turn commits itself. Sent with each turn.
     */
    approvalMode: ApprovalMode;
    toggleAssistantPanel: () => void;
    setAssistantPanelOpen: (open: boolean) => void;
    setAssistantPanelWidth: (width: number) => void;
    /** Mint a fresh conversation id (caller clears the message list). */
    startNewConversation: () => void;
    setActiveConversation: (id: string) => void;
    setHistoryOpen: (open: boolean) => void;
    setApprovalMode: (mode: ApprovalMode) => void;
}

export const useAssistantStore = create<AssistantState>()(
    persist(
        (set) => ({
            pendingMessage: null,
            requestMessage: (pendingMessage) => set({ pendingMessage, assistantPanelOpen: true }),
            clearPendingMessage: () => set({ pendingMessage: null }),
            assistantPanelOpen: false,
            assistantPanelWidth: 340, // default wider panel to fit interactive cards
            activeConversationId: null,
            historyOpen: false,
            approvalMode: "ask",
            toggleAssistantPanel: () => set((s) => ({ assistantPanelOpen: !s.assistantPanelOpen })),
            setAssistantPanelOpen: (open) => set({ assistantPanelOpen: open }),
            setAssistantPanelWidth: (width) => set({ assistantPanelWidth: width }),
            startNewConversation: () =>
                set({ activeConversationId: crypto.randomUUID(), historyOpen: false }),
            setActiveConversation: (id) => set({ activeConversationId: id, historyOpen: false }),
            setHistoryOpen: (open) => set({ historyOpen: open }),
            setApprovalMode: (mode) => set({ approvalMode: mode }),
        }),
        {
            name: "cadence-assistant-panel",
            // v1: the `autoApprove` boolean became `approvalMode` (true → "auto").
            version: 1,
            migrate: (persisted, version) => {
                const { autoApprove, ...rest } = (persisted ?? {}) as { autoApprove?: boolean };
                return version < 1 ? { ...rest, approvalMode: autoApprove ? "auto" : "ask" } : rest;
            },
            partialize: (state) => ({
                assistantPanelOpen: state.assistantPanelOpen,
                assistantPanelWidth: state.assistantPanelWidth,
                // Persist the active thread so reopening resumes it (§5.3).
                activeConversationId: state.activeConversationId,
                approvalMode: state.approvalMode,
            }),
        }
    )
);
