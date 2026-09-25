import { z } from "zod";
import { flexibleDateTimeSchema, isoDateTimeSchema, normalizeEndBoundary, normalizeStartBoundary, paginationSchema } from "./common";
import { DATE_STYLES, SOURCE_SURFACES, type CanonicalNlpEnvelope } from "@cadence/nlp/core";

// ── Enums / shared scalars ──
/** Who or what a WAITING task waits on. */
export const waitingOnSchema = z.string().max(500);

export const taskStateSchema = z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"]);
export type TaskState = z.infer<typeof taskStateSchema>;

export const taskInteractionModeSchema = z.enum(["task", "timetable"]);
export type TaskInteractionMode = z.infer<typeof taskInteractionModeSchema>;

export const sourceSurfaceSchema = z.enum(SOURCE_SURFACES);
export type SourceSurface = z.infer<typeof sourceSurfaceSchema>;

export const taskPrioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export const effortLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type EffortLevel = z.infer<typeof effortLevelSchema> | null;

export const canonicalNlpEnvelopeSchema = z.object({
    rawInput: z.string().min(1).max(2_000),
    sourceSurface: sourceSurfaceSchema,
    dateStyle: z.enum(DATE_STYLES),
    dismissedEntityIds: z.array(z.string().min(1).max(100)).default([]),
    userOverrides: z.record(z.string(), z.unknown()).default({}),
}) satisfies z.ZodType<CanonicalNlpEnvelope>; // nlp owns the type; this fails tsc if they drift

// ── Input schemas (moved verbatim from backend tasks.schema.ts) ──
export const insertTaskSchema = z.object({
    title: z.string().min(1).max(500),
    content: z.string().max(50_000).nullable().optional(),
    state: taskStateSchema.default("ACTIVE"),
    orderIndex: z.number(),
    isAllDay: z.boolean().default(true),
    dueDate: flexibleDateTimeSchema.nullable().optional(),
    scheduledStart: flexibleDateTimeSchema.nullable().optional(),
    scheduledEnd: flexibleDateTimeSchema.nullable().optional(),
    durationEstimate: z.number().int().min(1).max(1440).nullable().optional(),
    timezoneLocked: z.boolean().default(false),
    projectId: z.uuid().nullable().optional(),
    priority: taskPrioritySchema.default(0),
    isPinned: z.boolean().default(false),
    reminderAt: isoDateTimeSchema.nullable().optional(),
    reminderSilenced: z.boolean().default(false),
    recurrenceRule: z.string().max(500).nullable().optional(),
    // Omitted → the server picks a default (see @cadence/domain suggestInteractionMode).
    interactionMode: taskInteractionModeSchema.optional(),
    waitingOn: waitingOnSchema.nullable().optional(),
    waitingReminder: isoDateTimeSchema.nullable().optional(),
    effort: effortLevelSchema.nullable().optional(),
    notBefore: isoDateTimeSchema.nullable().optional(),
    sectionId: z.uuid().nullable().optional(),
    tagIds: z.array(z.uuid()).max(50).optional(),
    nlp: canonicalNlpEnvelopeSchema.optional(),
});
export type InsertTask = z.infer<typeof insertTaskSchema>;

export const updateTaskSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    content: z.string().max(50_000).nullable().optional(),
    state: taskStateSchema.optional(),
    orderIndex: z.number().optional(),
    isAllDay: z.boolean().optional(),
    dueDate: flexibleDateTimeSchema.nullable().optional(),
    scheduledStart: flexibleDateTimeSchema.nullable().optional(),
    scheduledEnd: flexibleDateTimeSchema.nullable().optional(),
    durationEstimate: z.number().int().min(1).max(1440).nullable().optional(),
    timezoneLocked: z.boolean().optional(),
    projectId: z.uuid().nullable().optional(),
    priority: taskPrioritySchema.optional(),
    isPinned: z.boolean().optional(),
    reminderAt: isoDateTimeSchema.nullable().optional(),
    reminderSilenced: z.boolean().optional(),
    recurrenceRule: z.string().max(500).nullable().optional(),
    interactionMode: taskInteractionModeSchema.optional(),
    waitingOn: waitingOnSchema.nullable().optional(),
    waitingReminder: isoDateTimeSchema.nullable().optional(),
    effort: effortLevelSchema.nullable().optional(),
    notBefore: isoDateTimeSchema.nullable().optional(),
    sectionId: z.uuid().nullable().optional(),
    expectedUpdatedAt: z.string().optional(),
});
export type UpdateTask = z.infer<typeof updateTaskSchema>;

export const reorderTaskSchema = z.object({
    orderIndex: z.number(),
    orderedTaskIds: z.array(z.uuid()).max(200).optional(),
});

/** The tasks one batch call may touch. */
export const batchTaskIdsSchema = z.array(z.uuid()).min(1).max(50);

export const batchDeleteSchema = z.object({
    taskIds: batchTaskIdsSchema,
});

export const batchStateSchema = z.object({
    taskIds: batchTaskIdsSchema,
    state: taskStateSchema,
});

/**
 * Either `scheduledStart` (every task gets that exact value) or `date` + `timezone`
 * (each task keeps its own local time on the new day, all-day stays all-day).
 */
export const batchRescheduleSchema = z
    .object({
        taskIds: batchTaskIdsSchema,
        scheduledStart: flexibleDateTimeSchema.optional(),
        isAllDay: z.boolean().default(true),
        date: z.iso.date().optional(),
        timezone: z.string().min(1).max(64).optional(),
    })
    .refine((v) => (v.scheduledStart === undefined) !== (v.date === undefined), "Send scheduledStart or date, not both")
    .refine((v) => v.date === undefined || v.timezone !== undefined, "date needs a timezone");
export type BatchReschedule = z.infer<typeof batchRescheduleSchema>;

// ── Row schema — exactly the DB columns (wire-shaped, timestamps as ISO strings) ──
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
    isAllDay: z.boolean(),
    dueDate: isoDateTimeSchema.nullable(),
    scheduledStart: isoDateTimeSchema.nullable(),
    scheduledEnd: isoDateTimeSchema.nullable(),
    durationEstimate: z.number().int().nullable(),
    timezoneLocked: z.boolean(),
    priority: z.number().int().min(0).max(4),
    isPinned: z.boolean(),
    reminderAt: isoDateTimeSchema.nullable(),
    reminderSilenced: z.boolean(),
    recurrenceRule: z.string().nullable(),
    interactionMode: taskInteractionModeSchema,
    waitingOn: z.string().nullable(),
    waitingReminder: isoDateTimeSchema.nullable(),
    effort: z.number().int().min(1).max(3).nullable(),
    notBefore: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});
export type TaskRow = z.infer<typeof taskRowSchema>;

// ── Entity schema — row + API enrichment (joins/derived). Narrows priority/effort
//    to the canonical literal unions that the client consumes. ──
export const taskSchema = taskRowSchema.extend({
    origin: z.enum(["thought"]).nullable().optional(),
    priority: taskPrioritySchema,
    effort: effortLevelSchema.nullable(),
    // The client treats these nullable columns as optional (matches the prior FE
    // interface — fixtures and partial reads may omit them).
    sectionId: z.uuid().nullable().optional(),
    waitingOn: z.string().nullable().optional(),
    waitingReminder: isoDateTimeSchema.nullable().optional(),
    notBefore: isoDateTimeSchema.nullable().optional(),
    tagIds: z.array(z.uuid()),
    isHabit: z.boolean().optional(),
    seriesId: z.uuid().optional(),
    isRecurringInstance: z.boolean().optional(),
    occurrenceStart: isoDateTimeSchema.nullable().optional(),
    occurrenceEnd: isoDateTimeSchema.nullable().optional(),
});
export type Task = z.infer<typeof taskSchema>;

// FE-facing input types use z.input so server-defaulted fields remain optional
// for clients building request bodies.
export type CreateTaskInput = z.input<typeof insertTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

// ── List filters (GET /tasks query) ──

const booleanQuerySchema = z
    .enum(["true", "false"])
    .transform((v) => v === "true");

const taskFiltersSchemaBase = z.object({
    state: taskStateSchema.optional(),
    projectId: z.uuid().optional(),
    scheduledDate: z.iso.date().optional(),
    scheduledRangeStart: flexibleDateTimeSchema.optional(),
    scheduledRangeEnd: flexibleDateTimeSchema.optional(),
    priority: z.coerce.number().int().min(0).max(4).optional(),
    isPinned: booleanQuerySchema.optional(),
    effort: z.coerce.number().int().min(1).max(3).optional(),
    notBeforeBefore: isoDateTimeSchema.optional(), // tasks where not_before <= this date
    hasNoDate: booleanQuerySchema.optional(),
    hasNoProject: booleanQuerySchema.optional(),
    effectiveOnOrBeforeDate: z.iso.date().optional(),
});

function refineTaskFilters(value: z.infer<typeof taskFiltersSchemaBase>, ctx: z.RefinementCtx) {
    const hasRangeStart = value.scheduledRangeStart !== undefined;
    const hasRangeEnd = value.scheduledRangeEnd !== undefined;

    if (hasRangeStart !== hasRangeEnd) {
        ctx.addIssue({
            code: "custom",
            message: "scheduledRangeStart and scheduledRangeEnd must be provided together",
            path: hasRangeStart ? ["scheduledRangeEnd"] : ["scheduledRangeStart"],
        });
    }

    if (value.scheduledRangeStart && value.scheduledRangeEnd) {
        const start = new Date(normalizeStartBoundary(value.scheduledRangeStart)).getTime();
        const end = new Date(normalizeEndBoundary(value.scheduledRangeEnd)).getTime();

        if (Number.isFinite(start) && Number.isFinite(end) && start > end) {
            ctx.addIssue({
                code: "custom",
                message: "scheduledRangeEnd must be on or after scheduledRangeStart",
                path: ["scheduledRangeEnd"],
            });
        }
    }
}

export const taskFiltersSchema = taskFiltersSchemaBase.superRefine(refineTaskFilters);
export type TaskFilters = z.infer<typeof taskFiltersSchema>;

// No default limit: open lists are the working set and views need all of it.
// Done and Trash grow forever, so their pages send a limit.
export const taskListQuerySchema = taskFiltersSchemaBase
    .extend({ limit: z.coerce.number().int().min(1).max(1000).optional(), offset: paginationSchema.shape.offset })
    .superRefine(refineTaskFilters);
export type TaskListQueryInput = z.input<typeof taskListQuerySchema>;
