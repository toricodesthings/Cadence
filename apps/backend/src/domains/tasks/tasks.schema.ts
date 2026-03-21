import { z } from "zod";
import { SOURCE_SURFACES } from "@cadence/nlp";
import { normalizeEndBoundary, normalizeStartBoundary } from "./task-filters";
import { paginationSchema } from "../../platform/common-schemas";

export const taskStateSchema = z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"]);
export type TaskState = z.infer<typeof taskStateSchema>;
export const taskInteractionModeSchema = z.enum(["task", "timetable"]);
export type TaskInteractionMode = z.infer<typeof taskInteractionModeSchema>;
const flexibleDateTimeSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const booleanQuerySchema = z
    .enum(["true", "false"])
    .transform((v) => v === "true");

export const sourceSurfaceSchema = z.enum(SOURCE_SURFACES);
export type SourceSurface = z.infer<typeof sourceSurfaceSchema>;

export const canonicalNlpEnvelopeSchema = z.object({
    rawInput: z.string().min(1).max(2_000),
    sourceSurface: sourceSurfaceSchema,
    dateStyle: z.enum(["mdy", "dmy", "ymd"]),
    dismissedEntityIds: z.array(z.string().min(1).max(100)).default([]),
    userOverrides: z.record(z.string(), z.unknown()).default({}),
});
export type CanonicalNlpEnvelopeInput = z.infer<typeof canonicalNlpEnvelopeSchema>;

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
    priority: z.number().int().min(0).max(4).default(0),
    isPinned: z.boolean().default(false),
    reminderAt: z.iso.datetime({ offset: true }).nullable().optional(),
    reminderSilenced: z.boolean().default(false),
    recurrenceRule: z.string().max(500).nullable().optional(),
    interactionMode: taskInteractionModeSchema.default("task"),
    waitingOn: z.string().max(500).nullable().optional(),
    waitingReminder: z.iso.datetime({ offset: true }).nullable().optional(),
    effort: z.number().int().min(1).max(3).nullable().optional(),
    notBefore: z.iso.datetime({ offset: true }).nullable().optional(),
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
    priority: z.number().int().min(0).max(4).optional(),
    isPinned: z.boolean().optional(),
    reminderAt: z.iso.datetime({ offset: true }).nullable().optional(),
    reminderSilenced: z.boolean().optional(),
    recurrenceRule: z.string().max(500).nullable().optional(),
    interactionMode: taskInteractionModeSchema.optional(),
    waitingOn: z.string().max(500).nullable().optional(),
    waitingReminder: z.iso.datetime({ offset: true }).nullable().optional(),
    effort: z.number().int().min(1).max(3).nullable().optional(),
    notBefore: z.iso.datetime({ offset: true }).nullable().optional(),
    sectionId: z.uuid().nullable().optional(),
    expectedUpdatedAt: z.string().optional(),
});
export type UpdateTask = z.infer<typeof updateTaskSchema>;

export const reorderTaskSchema = z.object({
    orderIndex: z.number(),
    orderedTaskIds: z.array(z.string().uuid()).max(200).optional(),
});

export const batchStateSchema = z.object({
    taskIds: z.array(z.uuid()).min(1).max(50),
    state: taskStateSchema,
});

const taskFiltersSchemaBase = z.object({
    state: taskStateSchema.optional(),
    projectId: z.uuid().optional(),
    scheduledDate: z.iso.date().optional(),
    scheduledRangeStart: flexibleDateTimeSchema.optional(),
    scheduledRangeEnd: flexibleDateTimeSchema.optional(),
    priority: z.coerce.number().int().min(0).max(4).optional(),
    isPinned: booleanQuerySchema.optional(),
    effort: z.coerce.number().int().min(1).max(3).optional(),
    notBeforeBefore: z.iso.datetime({ offset: true }).optional(), // tasks where not_before <= this date
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

export const taskListQuerySchema = taskFiltersSchemaBase.extend(paginationSchema.shape).superRefine(refineTaskFilters);

export const batchRescheduleSchema = z.object({
    taskIds: z.array(z.uuid()).min(1).max(50),
    scheduledStart: flexibleDateTimeSchema,
    isAllDay: z.boolean().default(true),
});
