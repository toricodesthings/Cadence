import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AssistantState {
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
     * Approval mode. Off (default): every proposal waits for the user's confirm.
     * On: proposals from a live turn commit themselves through the same REST path.
     */
    autoApprove: boolean;
    toggleAssistantPanel: () => void;
    setAssistantPanelOpen: (open: boolean) => void;
    setAssistantPanelWidth: (width: number) => void;
    /** Mint a fresh conversation id (caller clears the message list). */
    startNewConversation: () => void;
    setActiveConversation: (id: string) => void;
    setHistoryOpen: (open: boolean) => void;
    setAutoApprove: (on: boolean) => void;
}

export const useAssistantStore = create<AssistantState>()(
    persist(
        (set) => ({
            assistantPanelOpen: false,
            assistantPanelWidth: 340, // default wider panel to fit interactive cards
            activeConversationId: null,
            historyOpen: false,
            autoApprove: false,
            toggleAssistantPanel: () => set((s) => ({ assistantPanelOpen: !s.assistantPanelOpen })),
            setAssistantPanelOpen: (open) => set({ assistantPanelOpen: open }),
            setAssistantPanelWidth: (width) => set({ assistantPanelWidth: width }),
            startNewConversation: () =>
                set({ activeConversationId: crypto.randomUUID(), historyOpen: false }),
            setActiveConversation: (id) => set({ activeConversationId: id, historyOpen: false }),
            setHistoryOpen: (open) => set({ historyOpen: open }),
            setAutoApprove: (on) => set({ autoApprove: on }),
        }),
        {
            name: "cadence-assistant-panel",
            partialize: (state) => ({
                assistantPanelOpen: state.assistantPanelOpen,
                assistantPanelWidth: state.assistantPanelWidth,
                // Persist the active thread so reopening resumes it (§5.3).
                activeConversationId: state.activeConversationId,
                autoApprove: state.autoApprove,
            }),
        }
    )
);
