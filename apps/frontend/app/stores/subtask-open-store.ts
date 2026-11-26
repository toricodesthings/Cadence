import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SubtaskOpenState {
    open: Record<string, true>;
    setOpen: (taskId: string, open: boolean) => void;
}

export const useSubtaskOpenStore = create<SubtaskOpenState>()(
    persist(
        (set) => ({
            open: {},
            setOpen: (taskId, isOpen) =>
                set((state) => {
                    const { [taskId]: _, ...rest } = state.open;
                    return { open: isOpen ? { ...rest, [taskId]: true } : rest };
                }),
        }),
        { name: "cadence-subtask-open" },
    ),
);
