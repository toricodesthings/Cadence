import type { CreateTaskInput, SourceSurface, TaskPriority } from "@cadence/contracts/task";

export interface TaskSchedule {
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    recurrenceRule: string | null;
    isAllDay: boolean;
}

/**
 * The create payload for a task typed into a parsing field, with the NLP envelope
 * that records what the user kept. Shared by the inline add and the task composer.
 */
export function buildTypedTaskInput({
    rawInput,
    title,
    schedule,
    priority,
    projectId,
    tagIds,
    waitingOn,
    durationMinutes,
    surface,
    dateStyle,
    dismissedEntityIds,
    extra,
}: {
    rawInput: string;
    title: string;
    schedule: TaskSchedule;
    priority: TaskPriority;
    projectId: string | null;
    tagIds: string[];
    waitingOn: string | null;
    durationMinutes: number | null;
    surface: SourceSurface;
    dateStyle: "mdy" | "dmy" | "ymd";
    dismissedEntityIds: string[];
    /** Fields the parse never sets: orderIndex, sectionId, content, effort. */
    extra: Pick<CreateTaskInput, "orderIndex"> & Partial<CreateTaskInput>;
}): CreateTaskInput {
    return {
        ...extra,
        title,
        tagIds,
        dueDate: schedule.dueDate ?? undefined,
        scheduledStart: schedule.scheduledStart ?? undefined,
        scheduledEnd: schedule.scheduledEnd ?? undefined,
        recurrenceRule: schedule.recurrenceRule ?? undefined,
        isAllDay: schedule.isAllDay,
        ...(priority > 0 && { priority }),
        ...(projectId && { projectId }),
        ...(waitingOn && { waitingOn }),
        ...(durationMinutes && { durationEstimate: durationMinutes }),
        nlp: {
            rawInput,
            sourceSurface: surface,
            dateStyle,
            dismissedEntityIds,
            userOverrides: {
                title,
                projectId,
                tagIds,
                dueDate: schedule.dueDate,
                scheduledStart: schedule.scheduledStart,
                scheduledEnd: schedule.scheduledEnd,
                recurrenceRule: schedule.recurrenceRule,
            },
        },
    };
}
