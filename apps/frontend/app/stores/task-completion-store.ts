import { create } from "zustand";

const DEFAULT_COMPLETION_DELAY_MS = 1500;

type PendingTaskCompletion = {
    startedAt: number;
    commitAt: number;
    durationMs: number;
};

interface TaskCompletionState {
    pendingById: Record<string, PendingTaskCompletion>;
    queueCompletion: (input: {
        taskId: string;
        durationMs?: number;
        onCommit: () => void;
    }) => void;
    cancelCompletion: (taskId: string) => void;
    clearCompletion: (taskId: string) => void;
}

const completionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const completionCallbacks = new Map<string, () => void>();

export const useTaskCompletionStore = create<TaskCompletionState>((set, get) => ({
    pendingById: {},

    queueCompletion: ({ taskId, durationMs = DEFAULT_COMPLETION_DELAY_MS, onCommit }) => {
        if (get().pendingById[taskId]) return;

        const startedAt = Date.now();
        const commitAt = startedAt + durationMs;

        completionCallbacks.set(taskId, onCommit);

        const timerId = setTimeout(() => {
            completionTimers.delete(taskId);
            const commit = completionCallbacks.get(taskId);
            completionCallbacks.delete(taskId);
            set((state) => {
                const nextPending = { ...state.pendingById };
                delete nextPending[taskId];
                return { pendingById: nextPending };
            });
            commit?.();
        }, durationMs);

        completionTimers.set(taskId, timerId);

        set((state) => ({
            pendingById: {
                ...state.pendingById,
                [taskId]: {
                    startedAt,
                    commitAt,
                    durationMs,
                },
            },
        }));
    },

    cancelCompletion: (taskId) => {
        const timerId = completionTimers.get(taskId);
        if (timerId) {
            clearTimeout(timerId);
            completionTimers.delete(taskId);
        }

        completionCallbacks.delete(taskId);

        set((state) => {
            if (!state.pendingById[taskId]) return state;
            const nextPending = { ...state.pendingById };
            delete nextPending[taskId];
            return { pendingById: nextPending };
        });
    },

    clearCompletion: (taskId) => {
        const timerId = completionTimers.get(taskId);
        if (timerId) {
            clearTimeout(timerId);
            completionTimers.delete(taskId);
        }

        completionCallbacks.delete(taskId);

        set((state) => {
            if (!state.pendingById[taskId]) return state;
            const nextPending = { ...state.pendingById };
            delete nextPending[taskId];
            return { pendingById: nextPending };
        });
    },
}));
