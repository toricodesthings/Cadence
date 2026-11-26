import { create } from "zustand";
import type { LocalDate } from "@cadence/domain/time";

export interface FindTimeRequest {
    taskId: string;
    day: LocalDate;
    anchorDay: LocalDate | null;
    reason?: "no-gap";
}

interface FindTimeState {
    request: FindTimeRequest | null;
    open: (request: FindTimeRequest) => void;
    close: () => void;
}

export const useFindTimeStore = create<FindTimeState>((set) => ({
    request: null,
    open: (request) => set({ request }),
    close: () => set({ request: null }),
}));
