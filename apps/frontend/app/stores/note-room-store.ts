import { create } from "zustand";

interface NoteRoomState {
    /** Currently open task ID in the note room, or null when closed */
    taskId: string | null;
    /** Title of the task (for the note room header) */
    taskTitle: string;
    /** Heading text to scroll to after opening (cleared once consumed) */
    scrollToHeading: string | null;
    /** Open the note room for a given task */
    open: (taskId: string, taskTitle: string, scrollToHeading?: string) => void;
    /** Close the note room */
    close: () => void;
    /** Clear the scroll-to-heading after it's been consumed */
    clearScrollTarget: () => void;
}

export const useNoteRoomStore = create<NoteRoomState>()((set) => ({
    taskId: null,
    taskTitle: "",
    scrollToHeading: null,
    open: (taskId, taskTitle, scrollToHeading) =>
        set({ taskId, taskTitle, scrollToHeading: scrollToHeading ?? null }),
    close: () => set({ taskId: null, taskTitle: "", scrollToHeading: null }),
    clearScrollTarget: () => set({ scrollToHeading: null }),
}));
