import { create } from "zustand";

interface TaskSelectionState {
    selectedTaskIds: Set<string>;
    toggleTask: (taskId: string) => void;
    selectTask: (taskId: string) => void;
    deselectTask: (taskId: string) => void;
    clearSelection: () => void;
    selectAll: (taskIds: string[]) => void;
}

export const useTaskSelection = create<TaskSelectionState>((set) => ({
    selectedTaskIds: new Set<string>(),

    toggleTask: (taskId) => set((state) => {
        const next = new Set(state.selectedTaskIds);
        if (next.has(taskId)) {
            next.delete(taskId);
        } else {
            next.add(taskId);
        }
        return { selectedTaskIds: next };
    }),

    selectTask: (taskId) => set((state) => {
        const next = new Set(state.selectedTaskIds);
        next.add(taskId);
        return { selectedTaskIds: next };
    }),

    deselectTask: (taskId) => set((state) => {
        const next = new Set(state.selectedTaskIds);
        next.delete(taskId);
        return { selectedTaskIds: next };
    }),

    clearSelection: () => set({ selectedTaskIds: new Set<string>() }),

    selectAll: (taskIds) => set({ selectedTaskIds: new Set(taskIds) })
}));
