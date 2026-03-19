import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RightPanelState {
    holdingPanelOpen: boolean;
    holdingPanelWidth: number;
    toggleHoldingPanel: () => void;
    setHoldingPanelWidth: (width: number) => void;
}

export const useRightPanelStore = create<RightPanelState>()(
    persist(
        (set) => ({
            holdingPanelOpen: false,
            holdingPanelWidth: 320,
            toggleHoldingPanel: () => set((s) => ({ holdingPanelOpen: !s.holdingPanelOpen })),
            setHoldingPanelWidth: (width) => set({ holdingPanelWidth: width }),
        }),
        {
            name: "cadence-right-panel",
        },
    ),
);
