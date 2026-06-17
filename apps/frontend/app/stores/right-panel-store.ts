import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Which pane the shared right rail is showing. The rail is mutually exclusive:
 * the contextual side panel (review / calendar / task editor) and the Cadence
 * assistant never appear at once. A segmented toggle flips this when both are
 * available; opening/closing the assistant drives it automatically. */
export type RailView = "context" | "assistant";

interface RightPanelState {
    holdingPanelOpen: boolean;
    holdingPanelWidth: number;
    railView: RailView;
    toggleHoldingPanel: () => void;
    setHoldingPanelWidth: (width: number) => void;
    setRailView: (view: RailView) => void;
}

export const useRightPanelStore = create<RightPanelState>()(
    persist(
        (set) => ({
            holdingPanelOpen: false,
            holdingPanelWidth: 320,
            railView: "context",
            toggleHoldingPanel: () => set((s) => ({ holdingPanelOpen: !s.holdingPanelOpen })),
            setHoldingPanelWidth: (width) => set({ holdingPanelWidth: width }),
            setRailView: (view) => set({ railView: view }),
        }),
        {
            name: "cadence-right-panel",
        },
    ),
);
