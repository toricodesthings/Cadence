import { create } from "zustand";

export interface AutoTagOffer {
    tagId: string;
    tagName: string;
    places: string[];
    taskIds: string[];
}

interface AutoTagOfferState {
    offer: AutoTagOffer | null;
    show: (offer: AutoTagOffer) => void;
    clear: () => void;
}

export const useAutoTagOfferStore = create<AutoTagOfferState>((set) => ({
    offer: null,
    show: (offer) => set({ offer }),
    clear: () => set({ offer: null }),
}));
