import type { CanonicalNlpEnvelope, SourceSurface } from "@cadence/nlp/core";

export type TaskState = "ACTIVE" | "WAITING" | "COMPLETE" | "ARCHIVED";
export type TaskPriority = 0 | 1 | 2 | 3 | 4;
// 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent
export type TaskInteractionMode = "task" | "timetable";

export type EffortLevel = 1 | 2 | 3 | null;

export interface TaskSection {
    id: string;
    userId: string;
    projectId: string | null;
    name: string;
    orderIndex: number;
    createdAt: string;
}

export interface Subtask {
    id: string;
    taskId: string;
    title: string;
    isComplete: boolean;
    orderIndex: number;
    createdAt: string;
}

export interface Task {
    id: string;
    userId: string;
    projectId: string | null;
    sectionId?: string | null;
    title: string;
    content: string | null;
    state: TaskState;
    orderIndex: number;
    isAllDay: boolean;
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    durationEstimate: number | null;
    timezoneLocked: boolean;
    createdAt: string;
    updatedAt: string;

    // ── OLDER FIELDS ──
    priority: TaskPriority;
    isPinned: boolean;
    reminderAt: string | null;
    reminderSilenced: boolean;
    recurrenceRule: string | null;
    interactionMode: TaskInteractionMode;
    isHabit?: boolean;
    seriesId?: string;
    isRecurringInstance?: boolean;
    occurrenceStart?: string | null;
    occurrenceEnd?: string | null;

    // ── NEW FIELDS (Plan 7) ──
    waitingOn?: string | null;
    waitingReminder?: string | null;
    effort: EffortLevel;
    notBefore?: string | null;
    tagIds?: string[];
}

/** Input shape for creating a task via the API */
export interface CreateTaskInput {
    title: string;
    content?: string | null;
    orderIndex: number;
    projectId?: string;
    tagIds?: string[];
    scheduledStart?: string;
    scheduledEnd?: string;
    dueDate?: string;
    isAllDay?: boolean;
    timezoneLocked?: boolean;

    // ── OLDER FIELDS ──
    priority?: TaskPriority;
    isPinned?: boolean;
    reminderAt?: string;
    reminderSilenced?: boolean;
    recurrenceRule?: string;
    interactionMode?: TaskInteractionMode;

    // ── NEW FIELDS (Plan 7) ──
    waitingOn?: string | null;
    waitingReminder?: string | null;
    effort?: EffortLevel;
    notBefore?: string | null;
    sectionId?: string | null;
    durationEstimate?: number | null;
    nlp?: CanonicalNlpEnvelope;
}

export type TaskSourceSurface = SourceSurface;

/** Input shape for updating a task — all fields optional */
export type UpdateTaskInput = Partial<
    Pick<
        Task,
        | "title"
        | "content"
        | "state"
        | "projectId"
        | "isAllDay"
        | "dueDate"
        | "scheduledStart"
        | "scheduledEnd"
        | "durationEstimate"
        | "timezoneLocked"
        | "priority"
        | "isPinned"
        | "reminderAt"
        | "reminderSilenced"
        | "recurrenceRule"
        | "interactionMode"
        | "waitingOn"
        | "waitingReminder"
        | "effort"
        | "notBefore"
        | "sectionId"
        | "orderIndex"
    >
> & {
    expectedUpdatedAt?: string;
};

// ── Task Note (dedicated note storage) ──
export interface TaskNote {
    id: string;
    taskId: string;
    userId: string;
    body: string;
    excerpt: string;
    wordCount: number;
    headingCount: number;
    version: number;
    createdAt: string;
    updatedAt: string;
}
