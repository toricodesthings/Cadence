import type { Instant, LocalDate } from "@cadence/domain/time";
import type { CreateTaskInput, SourceSurface, TaskPriority } from "@cadence/contracts/task";

export interface TaskSchedule {
    dueDate: LocalDate | null;
    endDate?: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    recurrenceRule: string | null;
}

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
    notBefore?: LocalDate | null;
    reminderAt?: Instant | null;
    surface: SourceSurface;
    dateStyle: "mdy" | "dmy" | "ymd";
    dismissedEntityIds: string[];
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
        ...(waitingOn && { waitingOn, state: "WAITING" as const }),
        ...(durationMinutes && { durationEstimate: durationMinutes }),
        ...(notBefore && { notBefore }),
        ...(reminderAt && { reminderAt }),
        nlp: {
            rawInput,
            sourceSurface: surface,
            dateStyle,
            dismissedEntityIds,
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
