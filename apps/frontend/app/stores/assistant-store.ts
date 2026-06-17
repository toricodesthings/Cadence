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
    toggleAssistantPanel: () => void;
    setAssistantPanelOpen: (open: boolean) => void;
    setAssistantPanelWidth: (width: number) => void;
    /** Mint a fresh conversation id (caller clears the message list). */
    startNewConversation: () => void;
    setActiveConversation: (id: string) => void;
    setHistoryOpen: (open: boolean) => void;
}

export const useAssistantStore = create<AssistantState>()(
    persist(
        (set) => ({
            assistantPanelOpen: false,
            assistantPanelWidth: 340, // default wider panel to fit interactive cards
            activeConversationId: null,
            historyOpen: false,
            toggleAssistantPanel: () => set((s) => ({ assistantPanelOpen: !s.assistantPanelOpen })),
            setAssistantPanelOpen: (open) => set({ assistantPanelOpen: open }),
            setAssistantPanelWidth: (width) => set({ assistantPanelWidth: width }),
            startNewConversation: () =>
                set({ activeConversationId: crypto.randomUUID(), historyOpen: false }),
            setActiveConversation: (id) => set({ activeConversationId: id, historyOpen: false }),
            setHistoryOpen: (open) => set({ historyOpen: open }),
        }),
        {
            name: "cadence-assistant-panel",
            partialize: (state) => ({
                assistantPanelOpen: state.assistantPanelOpen,
                assistantPanelWidth: state.assistantPanelWidth,
                // Persist the active thread so reopening resumes it (§5.3).
                activeConversationId: state.activeConversationId,
            }),
        }
    )
);
