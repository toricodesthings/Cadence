import { create } from "zustand";

interface NoteRoomState {
    taskId: string | null;
    taskTitle: string;
    scrollToHeading: string | null;
    open: (taskId: string, taskTitle: string, scrollToHeading?: string) => void;
    close: () => void;
    clearScrollTarget: () => void;
}

export const useNoteRoomStore = create<NoteRoomState>()((set) => ({
    taskId: null,
    taskTitle: "",
    scrollToHeading: null,
    open: (taskId, taskTitle, scrollToHeading) => set({ taskId, taskTitle, scrollToHeading: scrollToHeading ?? null }),
    close: () => set({ taskId: null, taskTitle: "", scrollToHeading: null }),
    clearScrollTarget: () => set({ scrollToHeading: null }),
}));
