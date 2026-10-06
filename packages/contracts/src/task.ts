import { z } from "zod";
import { instantSchema, localDateSchema, paginationSchema, zoneSchema } from "./common";
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
    /** Client-chosen id, so a task made offline can be edited before it syncs. */
    id: z.uuid().optional(),
    title: z.string().min(1).max(500),
    content: z.string().max(50_000).nullable().optional(),
    state: taskStateSchema.default("ACTIVE"),
    orderIndex: z.number(),
    // A day (all-day or a deadline), or a timed block (instants plus the zone it was planned in).
    // All-day = no scheduledStart.
    dueDate: localDateSchema.nullable().optional(),
    endDate: localDateSchema.nullable().optional(),
    scheduledStart: instantSchema.nullable().optional(),
    scheduledEnd: instantSchema.nullable().optional(),
    zone: zoneSchema.nullable().optional(),
    durationEstimate: z.number().int().min(1).max(1440).nullable().optional(),
    timezoneLocked: z.boolean().default(false),
    projectId: z.uuid().nullable().optional(),
    priority: taskPrioritySchema.default(0),
    isPinned: z.boolean().default(false),
    reminderAt: instantSchema.nullable().optional(),
    reminderSilenced: z.boolean().default(false),
    recurrenceRule: z.string().max(500).nullable().optional(),
    // Omitted → the server picks a default (see @cadence/domain suggestInteractionMode).
    interactionMode: taskInteractionModeSchema.optional(),
    waitingOn: waitingOnSchema.nullable().optional(),
    waitingReminder: instantSchema.nullable().optional(),
    effort: effortLevelSchema.nullable().optional(),
    /** Hide until this day. */
    notBefore: localDateSchema.nullable().optional(),
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
    dueDate: localDateSchema.nullable().optional(),
    endDate: localDateSchema.nullable().optional(),
    scheduledStart: instantSchema.nullable().optional(),
    scheduledEnd: instantSchema.nullable().optional(),
    zone: zoneSchema.nullable().optional(),
    durationEstimate: z.number().int().min(1).max(1440).nullable().optional(),
    timezoneLocked: z.boolean().optional(),
    projectId: z.uuid().nullable().optional(),
    priority: taskPrioritySchema.optional(),
    isPinned: z.boolean().optional(),
    reminderAt: instantSchema.nullable().optional(),
    reminderSilenced: z.boolean().optional(),
    recurrenceRule: z.string().max(500).nullable().optional(),
    interactionMode: taskInteractionModeSchema.optional(),
    waitingOn: waitingOnSchema.nullable().optional(),
    waitingReminder: instantSchema.nullable().optional(),
    effort: effortLevelSchema.nullable().optional(),
    notBefore: localDateSchema.nullable().optional(),
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
 * Either `scheduledStart` (every task gets that exact instant) or `date` (each task keeps its
 * own local time on the new day, all-day stays all-day; the server uses the user's zone).
 */
export const batchRescheduleSchema = z
    .object({
        taskIds: batchTaskIdsSchema,
        scheduledStart: instantSchema.optional(),
        date: localDateSchema.optional(),
    })
    .refine((v) => (v.scheduledStart === undefined) !== (v.date === undefined), "Send scheduledStart or date, not both");
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
    notBefore: localDateSchema.nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
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
    waitingReminder: instantSchema.nullable().optional(),
    notBefore: localDateSchema.nullable().optional(),
    tagIds: z.array(z.uuid()),
    isHabit: z.boolean().optional(),
    seriesId: z.uuid().optional(),
    isRecurringInstance: z.boolean().optional(),
    /** The day an occurrence falls on (its id is `<seriesId>::<LocalDate>`). */
    occurrenceDay: localDateSchema.optional(),
    occurrenceStart: instantSchema.nullable().optional(),
    occurrenceEnd: instantSchema.nullable().optional(),
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
    /** A day window, inclusive: LocalDates. The server turns them into instant bounds in the user's zone. */
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    priority: z.coerce.number().int().min(0).max(4).optional(),
    isPinned: booleanQuerySchema.optional(),
    effort: z.coerce.number().int().min(1).max(3).optional(),
    notBeforeBefore: localDateSchema.optional(), // tasks hidden until this day or earlier (or never)
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

// No default limit: open lists are the working set and views need all of it.
// Done and Trash grow forever, so their pages send a limit.
export const taskListQuerySchema = taskFiltersSchemaBase
    .extend({ limit: z.coerce.number().int().min(1).max(1000).optional(), offset: paginationSchema.shape.offset })
    .superRefine(refineTaskFilters);
export type TaskListQueryInput = z.input<typeof taskListQuerySchema>;

/** Offline warming only reads open lists; keep history and pagination separate. */
export const TASK_BATCH_MAX = 10;
export const taskBatchFiltersSchema = z.array(taskFiltersSchemaBase
    .extend({ state: z.enum(["ACTIVE", "WAITING"]) })
    .superRefine(refineTaskFilters)
    .superRefine((value, ctx) => {
        if (value.from && value.to && Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`) > 41 * 86_400_000) {
            ctx.addIssue({ code: "custom", message: "Batch schedule ranges must fit within 42 days", path: ["to"] });
        }
    }).strict()).min(1).max(TASK_BATCH_MAX);
export type TaskBatchFiltersInput = z.input<typeof taskBatchFiltersSchema>;
export type TaskBatchFilters = z.infer<typeof taskBatchFiltersSchema>;

export const taskBatchQuerySchema = z.object({
    queries: z.string().max(12_000).transform((value, ctx) => {
        try { return JSON.parse(value) as unknown; }
        catch {
            ctx.addIssue({ code: "custom", message: "queries must be a JSON array" });
            return z.NEVER;
        }
    }).pipe(taskBatchFiltersSchema),
});

/** Task/occurrence rows are sent once; each list holds indices into that array. */
export const taskBatchSchema = z.object({
    tasks: z.array(taskSchema),
    lists: z.array(z.array(z.number().int().nonnegative())),
});
export type TaskBatch = z.infer<typeof taskBatchSchema>;
