import { create } from "zustand";

interface TagFilterState {
    activeTagId: string | null;
    setActiveTag: (id: string | null) => void;
    toggleTag: (id: string) => void;
}

export const useTagFilterStore = create<TagFilterState>((set) => ({
    activeTagId: null,
    setActiveTag: (id) => set({ activeTagId: id }),
    toggleTag: (id) =>
        set((state) => ({
            activeTagId: state.activeTagId === id ? null : id,
        })),
}));
