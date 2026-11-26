import { create } from "zustand";

interface TaskDetailIntentState {
    addStepsFor: string | null;
    offered: Record<string, true>;
    askForSteps: (taskId: string) => void;
    consume: (taskId: string) => void;
    stepWritten: (taskId: string) => boolean;
}

export const useTaskDetailIntentStore = create<TaskDetailIntentState>((set, get) => ({
    addStepsFor: null,
    offered: {},
    askForSteps: (taskId) => set((state) => ({ addStepsFor: taskId, offered: { ...state.offered, [taskId]: true } })),
    consume: (taskId) => set((state) => (state.addStepsFor === taskId ? { addStepsFor: null } : state)),
    stepWritten: (taskId) => {
        if (!get().offered[taskId]) return false;
        set((state) => {
            const { [taskId]: _, ...rest } = state.offered;
            return { offered: rest };
        });
        return true;
    },
}));
