import { z } from "zod";
import { isoDateTimeSchema } from "./common";

export const habitStatusSchema = z.enum(["COMPLETED", "SKIPPED", "PENDING"]);
export type HabitStatus = z.infer<typeof habitStatusSchema>;

/** RRULE weekday keys, Monday first. */
export const HABIT_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const habitTimeSchema = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal("")]);
/** Per-weekday time overrides; a day without a key uses `targetTime`, "" means any time. */
export const habitTargetTimesSchema = z.partialRecord(z.enum(HABIT_WEEKDAYS), habitTimeSchema);

/** A routine's ordered steps ("water → stretch → journal"); ids are made by the client. */
export const MAX_ROUTINE_STEPS = 12;
export const routineStepSchema = z.object({ id: z.string().min(1).max(64), title: z.string().trim().min(1).max(200) });
export type RoutineStep = z.infer<typeof routineStepSchema>;
export const routineStepsSchema = z.array(routineStepSchema).max(MAX_ROUTINE_STEPS)
    .refine((steps) => new Set(steps.map((step) => step.id)).size === steps.length, "Step ids must be unique");
/** One day's steps, by step id: done or skipped. A step without a key is still open. */
export const stepStatusSchema = z.record(z.string().max(64), z.enum(["COMPLETED", "SKIPPED"]))
    .refine((marks) => Object.keys(marks).length <= MAX_ROUTINE_STEPS, "Too many steps");
export type StepStatus = z.infer<typeof stepStatusSchema>;

// No .default()s on create schemas: an omitted field takes its DB column default, and
// a default here would leak into the .partial() update schema and overwrite data.
export const insertHabitSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(10_000).nullable().optional(),
    notes: z.string().nullable().optional(),
    recurrenceRule: z.string().max(500),
    targetTime: z.string().max(30).nullable().optional(),
    targetTimes: habitTargetTimesSchema.nullable().optional(),
    emoji: z.string().max(16).nullable().optional(),
    reminderEnabled: z.boolean().optional(),
    colorAccent: z.string().optional(),
    archived: z.boolean().optional(),
    projectId: z.string().uuid().nullable().optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    sortOrder: z.number().optional(),
    pausedUntil: z.string().nullable().optional(),
    steps: routineStepsSchema.nullable().optional(),
});
export type InsertHabit = z.input<typeof insertHabitSchema>;

export const updateHabitSchema = insertHabitSchema.partial().extend({
    // Any timestamp text, like task/note updates: the server compares instants, so
    // an equivalent form (or a value cached before timestamps were unified) still matches.
    expectedUpdatedAt: z.string().optional(),
});
export type UpdateHabit = z.input<typeof updateHabitSchema>;

export const resolveHabitActionSchema = z.object({
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/), // YYYY-MM-DD or full ISO datetime — server truncates to date
    status: habitStatusSchema,
    /** A routine with steps: the day's step marks. The server derives `status` from them (see `stepDayStatus`). */
    stepStatus: stepStatusSchema.optional(),
    /** The caller's IANA zone, so "today" (and the streak) is their day, not UTC's. */
    timezone: z.string().max(64).optional(),
});
export type ResolveHabitAction = z.infer<typeof resolveHabitActionSchema>;

export const weeklyHabitsQuerySchema = z.object({
    start: z.string().min(1), // e.g., YYYY-MM-DD
    end: z.string().min(1),
    archived: z.string().optional().default("false").transform(v => v === "true"),
    timezone: z.string().optional().default("UTC"),
});

export const habitListQuerySchema = z.object({
    archived: z.string().optional().default("false").transform(v => v === "true"),
});

// ── Row schema (exact DB columns) ──
export const habitRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    title: z.string(),
    description: z.string().nullable(),
    recurrenceRule: z.string(),
    targetTime: z.string().nullable(),
    targetTimes: z.record(z.string(), z.string()).nullable(),
    emoji: z.string().nullable(),
    reminderEnabled: z.boolean(),
    projectId: z.uuid().nullable(),
    sortOrder: z.number(),
    pausedUntil: z.string().nullable(),
    totalCompletions: z.number().int(),
    totalSkips: z.number().int(),
    currentStreak: z.number().int(),
    longestStreak: z.number().int(),
    colorAccent: z.string(),
    archived: z.boolean(),
    notes: z.string().nullable(),
    steps: z.array(z.object({ id: z.string(), title: z.string() })).nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});
export type HabitRow = z.infer<typeof habitRowSchema>;

// ── HabitLog entity ──
export const habitLogSchema = z.object({
    id: z.string(),
    habitId: z.uuid(),
    userId: z.uuid().optional(),
    status: habitStatusSchema,
    targetDate: z.string(),
    completedAt: z.string().nullable(),
    stepStatus: z.record(z.string(), z.enum(["COMPLETED", "SKIPPED"])).nullable().optional(),
    resolvedAt: z.string().nullable().optional(),
    createdAt: z.string().optional(),
});
export type HabitLog = z.infer<typeof habitLogSchema>;

// ── Habit entity — row + weekly-endpoint enrichment ──
export const habitSchema = habitRowSchema.extend({
    tagIds: z.array(z.uuid()).optional(),
    logs: z.array(habitLogSchema).optional(),
    isDueToday: z.boolean().optional(),
    isOverdue: z.boolean().optional(),
    pendingCountInWindow: z.number().optional(),
    completedCountInWindow: z.number().optional(),
    scheduledCountInWindow: z.number().optional(),
    adherenceRateInWindow: z.number().optional(),
});
export type Habit = z.infer<typeof habitSchema>;
