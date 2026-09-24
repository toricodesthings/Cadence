import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Which tasks have their inline subtasks open, kept across reloads. */
interface SubtaskOpenState {
    // ponytail: ids of trashed tasks left open linger here; prune against the task list if it ever grows noticeably
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
