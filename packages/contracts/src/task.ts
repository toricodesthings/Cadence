import { z } from "zod";
import { instantSchema, localDateSchema, paginationSchema, zoneSchema } from "./common";
import { linkedAppIdSchema, linkedUrlSchema } from "./app-link";
import { findTimeSchema } from "./planning";
import { DATE_STYLES, SOURCE_SURFACES, type CanonicalNlpEnvelope } from "@cadence/nlp/core";

export const waitingOnSchema = z.string().max(500);

export const taskStateSchema = z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"]);
export type TaskState = z.infer<typeof taskStateSchema>;
export const openTaskStateSchema = taskStateSchema.extract(["ACTIVE", "WAITING"]);
export const OPEN_TASK_STATES = openTaskStateSchema.options;

export const taskInteractionModeSchema = z.enum(["task", "timetable"]);
export type TaskInteractionMode = z.infer<typeof taskInteractionModeSchema>;

export const sourceSurfaceSchema = z.enum(SOURCE_SURFACES);
export type SourceSurface = z.infer<typeof sourceSurfaceSchema>;

export const taskPrioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export const effortOriginSchema = z.enum(["manual", "accepted"]);
export type EffortOrigin = z.infer<typeof effortOriginSchema>;
export const effortLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type EffortLevel = z.infer<typeof effortLevelSchema> | null;

export const canonicalNlpEnvelopeSchema = z.object({
    rawInput: z.string().min(1).max(2_000),
    sourceSurface: sourceSurfaceSchema,
    dateStyle: z.enum(DATE_STYLES),
    dismissedEntityIds: z.array(z.string().min(1).max(100)).default([]),
    userOverrides: z.record(z.string(), z.unknown()).default({}),
    resolved: z.boolean().optional(),
}) satisfies z.ZodType<CanonicalNlpEnvelope>;

const taskWhenFields = {
    dueDate: localDateSchema.nullable().optional(),
    endDate: localDateSchema.nullable().optional(),
    scheduledStart: instantSchema.nullable().optional(),
    scheduledEnd: instantSchema.nullable().optional(),
    zone: zoneSchema.nullable().optional(),
    durationEstimate: z.number().int().min(1).max(1440).nullable().optional(),
};

const taskSharedOptionalFields = {
    projectId: z.uuid().nullable().optional(),
    reminderAt: instantSchema.nullable().optional(),
    recurrenceRule: z.string().max(500).nullable().optional(),
    interactionMode: taskInteractionModeSchema.optional(),
    waitingOn: waitingOnSchema.nullable().optional(),
    waitingReminder: instantSchema.nullable().optional(),
    effort: effortLevelSchema.nullable().optional(),
    effortOrigin: effortOriginSchema.optional(),
    notBefore: localDateSchema.nullable().optional(),
    linkedAppId: linkedAppIdSchema.nullable().optional(),
    linkedUrl: linkedUrlSchema.nullable().optional(),
    sectionId: z.uuid().nullable().optional(),
};

export const insertTaskSchema = z.object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1).max(500),
    content: z.string().max(50_000).nullable().optional(),
    state: taskStateSchema.default("ACTIVE"),
    orderIndex: z.number(),
    ...taskWhenFields,
    timezoneLocked: z.boolean().default(false),
    priority: taskPrioritySchema.default(0),
    isPinned: z.boolean().default(false),
    reminderSilenced: z.boolean().default(false),
    ...taskSharedOptionalFields,
    tagIds: z.array(z.uuid()).max(50).optional(),
    nlp: canonicalNlpEnvelopeSchema.optional(),
});
export type InsertTask = z.infer<typeof insertTaskSchema>;

export const updateTaskSchema = z.object({
    title: z.string().trim().min(1).max(500).optional(),
    content: z.string().max(50_000).nullable().optional(),
    state: taskStateSchema.optional(),
    orderIndex: z.number().optional(),
    ...taskWhenFields,
    timezoneLocked: z.boolean().optional(),
    priority: taskPrioritySchema.optional(),
    isPinned: z.boolean().optional(),
    reminderSilenced: z.boolean().optional(),
    ...taskSharedOptionalFields,
    effortGuessSource: z.literal("dismissed").optional(),
    takenBy: z.uuid().nullable().optional(),
    findTime: findTimeSchema.optional(),
    expectedUpdatedAt: z.string().optional(),
});
export type UpdateTask = z.infer<typeof updateTaskSchema>;

export const reorderTaskSchema = z.object({
    orderIndex: z.number(),
    orderedTaskIds: z.array(z.uuid()).max(200).optional(),
});

export const batchTaskIdsSchema = z.array(z.uuid()).min(1).max(50);

export const batchDeleteSchema = z.object({
    taskIds: batchTaskIdsSchema,
});

export const batchStateSchema = z.object({
    taskIds: batchTaskIdsSchema,
    state: taskStateSchema,
});

export const batchRescheduleSchema = z
    .object({
        taskIds: batchTaskIdsSchema,
        scheduledStart: instantSchema.optional(),
        date: localDateSchema.optional(),
    })
    .refine(
        (v) => (v.scheduledStart === undefined) !== (v.date === undefined),
        "Send scheduledStart or date, not both",
    );
export type BatchReschedule = z.infer<typeof batchRescheduleSchema>;

export const placeTaskItemSchema = z.object({
    id: z.uuid(),
    scheduledStart: instantSchema.nullable(),
    scheduledEnd: instantSchema.nullable(),
    dueDate: localDateSchema.nullable().optional(),
    endDate: localDateSchema.nullable().optional(),
    zone: zoneSchema.nullable().optional(),
    expectedUpdatedAt: z.string(),
});
export const placeTasksSchema = z.object({ items: z.array(placeTaskItemSchema).min(1).max(50) });
export type PlaceTaskItem = z.infer<typeof placeTaskItemSchema>;

export const taskRowSchema = z.object({
    origin: z.enum(["thought"]).nullable(),
    id: z.uuid(),
    userId: z.uuid(),
    projectId: z.uuid().nullable(),
    sectionId: z.uuid().nullable(),
    title: z.string(),
    content: z.string().nullable(),
    state: taskStateSchema,
    orderIndex: z.number(),
    dueDate: localDateSchema.nullable(),
    endDate: localDateSchema.nullable(),
    scheduledStart: instantSchema.nullable(),
    scheduledEnd: instantSchema.nullable(),
    zone: zoneSchema.nullable(),
    durationEstimate: z.number().int().nullable(),
    timezoneLocked: z.boolean(),
    priority: z.number().int().min(0).max(4),
    isPinned: z.boolean(),
    reminderAt: instantSchema.nullable(),
    reminderSilenced: z.boolean(),
    recurrenceRule: z.string().nullable(),
    interactionMode: taskInteractionModeSchema,
    waitingOn: z.string().nullable(),
    waitingReminder: instantSchema.nullable(),
    effort: z.number().int().min(1).max(3).nullable(),
    effortOrigin: z.string().nullable(),
    effortChosenAt: instantSchema.nullable(),
    effortGuess: z.number().int().min(1).max(3).nullable(),
    effortGuessSource: z.string().nullable(),
    effortGuessAt: instantSchema.nullable(),
    notBefore: localDateSchema.nullable(),
    linkedAppId: z.string().nullable(),
    linkedUrl: z.string().nullable(),
    completedAt: instantSchema.nullable(),
    takenBy: z.uuid().nullable(),
    takenAt: instantSchema.nullable(),
    createdBy: z.uuid().nullable(),
    updatedBy: z.uuid().nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});
export type TaskRow = z.infer<typeof taskRowSchema>;

export const taskSchema = taskRowSchema.omit({ effortOrigin: true, effortChosenAt: true, effortGuessAt: true }).extend({
    effortGuess: effortLevelSchema.nullable().optional(),
    effortGuessSource: z.enum(["model", "dismissed"]).nullable().optional(),
    origin: z.enum(["thought"]).nullable().optional(),
    priority: taskPrioritySchema,
    effort: effortLevelSchema.nullable(),
    sectionId: z.uuid().nullable().optional(),
    waitingOn: z.string().nullable().optional(),
    waitingReminder: instantSchema.nullable().optional(),
    notBefore: localDateSchema.nullable().optional(),
    linkedAppId: z.string().nullable().optional(),
    linkedUrl: z.string().nullable().optional(),
    tagIds: z.array(z.uuid()),
    takenBy: z.uuid().nullable().optional(),
    takenAt: instantSchema.nullable().optional(),
    createdBy: z.uuid().nullable().optional(),
    updatedBy: z.uuid().nullable().optional(),
    isHabit: z.boolean().optional(),
    seriesId: z.uuid().optional(),
    isRecurringInstance: z.boolean().optional(),
    occurrenceDay: localDateSchema.optional(),
    occurrenceStart: instantSchema.nullable().optional(),
    occurrenceEnd: instantSchema.nullable().optional(),
});
export type Task = z.infer<typeof taskSchema>;

export type CreateTaskInput = z.input<typeof insertTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export const effortEvidenceRowSchema = z.object({
    id: z.uuid(),
    title: z.string(),
    projectId: z.uuid().nullable(),
    effort: effortLevelSchema,
    origin: effortOriginSchema,
    chosenAt: instantSchema,
});
export type EffortEvidenceRow = z.infer<typeof effortEvidenceRowSchema>;

const booleanQuerySchema = z.enum(["true", "false"]).transform((v) => v === "true");

const taskFiltersSchemaBase = z.object({
    state: taskStateSchema.optional(),
    projectId: z.uuid().optional(),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    priority: z.coerce.number().int().min(0).max(4).optional(),
    isPinned: booleanQuerySchema.optional(),
    effort: z.coerce.number().int().min(1).max(3).optional(),
    notBeforeBefore: localDateSchema.optional(),
    hasNoDate: booleanQuerySchema.optional(),
    hasNoProject: booleanQuerySchema.optional(),
    effectiveOnOrBeforeDate: localDateSchema.optional(),
});

function refineTaskFilters(value: z.infer<typeof taskFiltersSchemaBase>, ctx: z.RefinementCtx) {
    if ((value.from !== undefined) !== (value.to !== undefined)) {
        ctx.addIssue({
            code: "custom",
            message: "from and to must be provided together",
            path: [value.from !== undefined ? "to" : "from"],
        });
    }

    if (value.from && value.to && value.from > value.to) {
        ctx.addIssue({ code: "custom", message: "to must be on or after from", path: ["to"] });
    }
}

export const taskFiltersSchema = taskFiltersSchemaBase.superRefine(refineTaskFilters);
export type TaskFilters = z.infer<typeof taskFiltersSchema>;

export const taskListQuerySchema = taskFiltersSchemaBase
    .extend({ limit: z.coerce.number().int().min(1).max(1000).optional(), offset: paginationSchema.shape.offset })
    .superRefine(refineTaskFilters);
export type TaskListQueryInput = z.input<typeof taskListQuerySchema>;

export const TASK_BATCH_MAX = 10;
export const taskBatchFiltersSchema = z
    .array(
        taskFiltersSchemaBase
            .extend({ state: openTaskStateSchema })
            .superRefine(refineTaskFilters)
            .superRefine((value, ctx) => {
                if (
                    value.from &&
                    value.to &&
                    Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`) > 41 * 86_400_000
                ) {
                    ctx.addIssue({
                        code: "custom",
                        message: "Batch schedule ranges must fit within 42 days",
                        path: ["to"],
                    });
                }
            })
            .strict(),
    )
    .min(1)
    .max(TASK_BATCH_MAX);
export type TaskBatchFiltersInput = z.input<typeof taskBatchFiltersSchema>;
export type TaskBatchFilters = z.infer<typeof taskBatchFiltersSchema>;

export const taskBatchQuerySchema = z.object({
    queries: z
        .string()
        .max(12_000)
        .transform((value, ctx) => {
            try {
                return JSON.parse(value) as unknown;
            } catch {
                ctx.addIssue({ code: "custom", message: "queries must be a JSON array" });
                return z.NEVER;
            }
        })
        .pipe(taskBatchFiltersSchema),
});

export const taskBatchSchema = z.object({
    tasks: z.array(taskSchema),
    lists: z.array(z.array(z.number().int().nonnegative())),
});
export type TaskBatch = z.infer<typeof taskBatchSchema>;
