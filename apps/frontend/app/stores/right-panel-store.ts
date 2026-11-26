import { create } from "zustand";
import { persist } from "zustand/middleware";

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
