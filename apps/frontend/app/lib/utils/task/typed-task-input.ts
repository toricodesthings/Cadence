import type { Instant, LocalDate } from "@cadence/domain/time";
import type { CreateTaskInput, SourceSurface, TaskPriority } from "@cadence/contracts/task";

/** A day (`dueDate`, a LocalDate) or a timed block (`scheduledStart`/`scheduledEnd`, Instants). */
export interface TaskSchedule {
    dueDate: LocalDate | null;
    /** Inclusive last day of an all-day span. */
    endDate?: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    recurrenceRule: string | null;
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
    notBefore,
    reminderAt,
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
    /** Hide until this day. */
    notBefore?: LocalDate | null;
    /** A reminder at an exact moment. */
    reminderAt?: Instant | null;
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
        endDate: schedule.endDate ?? undefined,
        scheduledStart: schedule.scheduledStart ?? undefined,
        scheduledEnd: schedule.scheduledEnd ?? undefined,
        recurrenceRule: schedule.recurrenceRule ?? undefined,
        ...(priority > 0 && { priority }),
        ...(projectId && { projectId }),
        // Waiting on someone is a state: the editor shows who only on WAITING work.
        ...(waitingOn && { waitingOn, state: "WAITING" as const }),
        ...(durationMinutes && { durationEstimate: durationMinutes }),
        ...(notBefore && { notBefore }),
        ...(reminderAt && { reminderAt }),
        nlp: {
            rawInput,
            sourceSurface: surface,
            dateStyle,
            dismissedEntityIds,
            // The fields above are the user's final choices; the server stores this record and does not reinterpret it.
            resolved: true,
            userOverrides: {
                title,
                projectId,
                tagIds,
                dueDate: schedule.dueDate,
                endDate: schedule.endDate ?? null,
                scheduledStart: schedule.scheduledStart,
                scheduledEnd: schedule.scheduledEnd,
                recurrenceRule: schedule.recurrenceRule,
            },
        },
    };
}
