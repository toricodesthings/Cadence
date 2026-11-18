import { create } from "zustand";

/** A new tag is named like a place that already holds open tasks: offer to tag them. One at a time. */
export interface AutoTagOffer {
    tagId: string;
    tagName: string;
    /** Names of the matching lists and sections. */
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
