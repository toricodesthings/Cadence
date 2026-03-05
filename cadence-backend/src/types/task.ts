import { z } from "zod";

export const taskStateSchema = z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"]);
export type TaskState = z.infer<typeof taskStateSchema>;

export const insertTaskSchema = z.object({
    title: z.string().min(1).max(500),
    content: z.string().max(10_000).nullable().optional(),
    state: taskStateSchema.default("ACTIVE"),
    orderIndex: z.number(),
    isAllDay: z.boolean().default(true),
    dueDate: z.union([z.iso.date(), z.iso.datetime()]).nullable().optional(),
    scheduledStart: z.iso.datetime().nullable().optional(),
    scheduledEnd: z.iso.datetime().nullable().optional(),
    durationEstimate: z.number().int().min(1).max(1440).nullable().optional(),
    timezoneLocked: z.boolean().default(false),
    projectId: z.uuid().nullable().optional(),
    priority: z.number().int().min(0).max(4).default(0),
    isPinned: z.boolean().default(false),
    reminderAt: z.iso.datetime().nullable().optional(),
    reminderSilenced: z.boolean().default(false),
    recurrenceRule: z.string().max(500).nullable().optional(),
    waitingOn: z.string().max(500).nullable().optional(),
    waitingReminder: z.iso.datetime().nullable().optional(),
    effort: z.number().int().min(1).max(3).nullable().optional(),
    notBefore: z.iso.datetime().nullable().optional(),
    sectionId: z.uuid().nullable().optional(),
});
export type InsertTask = z.infer<typeof insertTaskSchema>;

export const updateTaskSchema = insertTaskSchema.partial();
export type UpdateTask = z.infer<typeof updateTaskSchema>;

export const reorderTaskSchema = z.object({
    orderIndex: z.number(),
});

export const batchStateSchema = z.object({
    taskIds: z.array(z.uuid()).min(1).max(50),
    state: taskStateSchema,
});

export const taskFiltersSchema = z.object({
    state: taskStateSchema.optional(),
    projectId: z.uuid().optional(),
    scheduledDate: z.iso.date().optional(),
    scheduledRangeStart: z.iso.datetime().optional(),
    scheduledRangeEnd: z.iso.datetime().optional(),
    priority: z.coerce.number().int().min(0).max(4).optional(),
    isPinned: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional(),
    effort: z.coerce.number().int().min(1).max(3).optional(),
    notBeforeBefore: z.iso.datetime().optional(), // tasks where not_before <= this date
    hasNoDate: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional(),
});
export type TaskFilters = z.infer<typeof taskFiltersSchema>;

export const batchRescheduleSchema = z.object({
    taskIds: z.array(z.uuid()).min(1).max(50),
    scheduledStart: z.iso.datetime(),
    isAllDay: z.boolean().default(true),
});
