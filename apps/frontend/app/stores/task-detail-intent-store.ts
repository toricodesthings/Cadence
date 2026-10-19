import { create } from "zustand";

/**
 * "Break into steps" says where to go, not what to write: the task's subtask field takes focus wherever that task's
 * subtasks are shown (its row, or its details). Whoever shows them consumes the intent, once.
 */
interface TaskDetailIntentState {
    addStepsFor: string | null;
    /** Tasks whose first step is the offered action: writing it is what the server records as "chosen". */
    offered: Record<string, true>;
    askForSteps: (taskId: string) => void;
    consume: (taskId: string) => void;
    /** True once per offer: the person has now written a step. */
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
