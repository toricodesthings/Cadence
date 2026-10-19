import { create } from "zustand";
import type { LocalDate } from "@cadence/domain/time";

/** The Find a time sheet: opened for Other day, or when a day has no gap. One at a time. */
export interface FindTimeRequest {
    taskId: string;
    day: LocalDate;
    /** The day the task sat on before Cadence touched it: "After its day" is measured against it. */
    anchorDay: LocalDate | null;
    /** Say why it opened unasked. */
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
