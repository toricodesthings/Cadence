import { z } from "zod";
import { instantSchema, localDateSchema, wallTimeSchema } from "./common";
import { linkedAppIdSchema, linkedUrlSchema } from "./app-link";
import { listMemberSchema, listRoleSchema } from "./sharing";

export const routineShareModeSchema = z.enum(["together", "turns"]);
export type RoutineShareMode = z.infer<typeof routineShareModeSchema>;

export const routineOtherCompletionSchema = z.object({
    userId: z.uuid(),
    status: z.literal("COMPLETED"),
});
export const routineDayShareSchema = z.object({
    turn: z.uuid().nullable(),
    others: z.array(routineOtherCompletionSchema),
});
export type RoutineDayShare = z.infer<typeof routineDayShareSchema>;

export const routineTodaySchema = routineDayShareSchema.extend({
    cheers: z.array(z.uuid()),
});
export type RoutineToday = z.infer<typeof routineTodaySchema>;

export const setTurnOrderSchema = z.object({ order: z.array(z.uuid()).min(2).max(20) });
export const setShareModeSchema = z.object({ mode: routineShareModeSchema });
export const cheerSchema = z.object({ targetDate: localDateSchema });

export const habitStatusSchema = z.enum(["COMPLETED", "SKIPPED", "PENDING"]);
export type HabitStatus = z.infer<typeof habitStatusSchema>;

export const HABIT_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const habitTimeSchema = z.union([wallTimeSchema, z.literal("")]);
export const habitTargetTimesSchema = z.partialRecord(z.enum(HABIT_WEEKDAYS), habitTimeSchema);

export const MAX_ROUTINE_STEPS = 12;
export const routineStepSchema = z.object({ id: z.string().min(1).max(64), title: z.string().trim().min(1).max(200) });
export type RoutineStep = z.infer<typeof routineStepSchema>;
export const routineStepsSchema = z
    .array(routineStepSchema)
    .max(MAX_ROUTINE_STEPS)
    .refine((steps) => new Set(steps.map((step) => step.id)).size === steps.length, "Step ids must be unique");
export const stepStatusSchema = z
    .record(z.string().max(64), z.enum(["COMPLETED", "SKIPPED"]))
    .refine((marks) => Object.keys(marks).length <= MAX_ROUTINE_STEPS, "Too many steps");
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const MAX_ROUTINE_TIMES = 12;
export const routineTimesSchema = z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times are HH:MM, 24h"))
    .max(MAX_ROUTINE_TIMES)
    .refine((times) => new Set(times).size === times.length, "Times must be unique");
export const timeMarkSchema = z.object({ status: z.enum(["COMPLETED", "SKIPPED"]), at: instantSchema.nullable() });
export type TimeMark = z.infer<typeof timeMarkSchema>;
export const timeMarksSchema = z
    .record(wallTimeSchema, timeMarkSchema)
    .refine((marks) => Object.keys(marks).length <= MAX_ROUTINE_TIMES, "Too many times");
export type TimeMarks = z.infer<typeof timeMarksSchema>;

export const insertHabitSchema = z.object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1).max(255),
    description: z.string().max(10_000).nullable().optional(),
    notes: z.string().nullable().optional(),
    recurrenceRule: z.string().max(500),
    targetTime: wallTimeSchema.nullable().optional(),
    targetTimes: habitTargetTimesSchema.nullable().optional(),
    emoji: z.string().max(16).nullable().optional(),
    reminderEnabled: z.boolean().optional(),
    colorAccent: z.string().optional(),
    archived: z.boolean().optional(),
    projectId: z.uuid().nullable().optional(),
    tagIds: z.array(z.uuid()).optional(),
    sortOrder: z.number().optional(),
    pausedUntil: z.string().nullable().optional(),
    steps: routineStepsSchema.nullable().optional(),
    times: routineTimesSchema.nullable().optional(),
    linkedAppId: linkedAppIdSchema.nullable().optional(),
    linkedUrl: linkedUrlSchema.nullable().optional(),
});
export type InsertHabit = z.input<typeof insertHabitSchema>;

export const updateHabitSchema = insertHabitSchema.omit({ id: true }).partial().extend({
    expectedUpdatedAt: z.string().optional(),
});
export type UpdateHabit = z.input<typeof updateHabitSchema>;

export const resolveHabitActionSchema = z.object({
    targetDate: localDateSchema,
    status: habitStatusSchema,
    stepStatus: stepStatusSchema.optional(),
    time: wallTimeSchema.optional(),
    at: instantSchema.optional(),
});
export type ResolveHabitAction = z.infer<typeof resolveHabitActionSchema>;

export const weeklyHabitsQuerySchema = z.object({
    start: localDateSchema,
    end: localDateSchema,
    archived: z
        .string()
        .optional()
        .default("false")
        .transform((v) => v === "true"),
});

export const habitListQuerySchema = z.object({
    archived: z
        .string()
        .optional()
        .default("false")
        .transform((v) => v === "true"),
});

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
    times: z.array(z.string()).nullable(),
    linkedAppId: z.string().nullable(),
    linkedUrl: z.string().nullable(),
    shareMode: routineShareModeSchema.nullable(),
    turnOrder: z.array(z.uuid()).nullable(),
    turnsFrom: z.string().nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});
export type HabitRow = z.infer<typeof habitRowSchema>;

export const habitLogStepStatusSchema = z.record(z.string(), z.enum(["COMPLETED", "SKIPPED"]));

export const habitLogRowSchema = z.object({
    id: z.uuid(),
    habitId: z.uuid(),
    userId: z.uuid(),
    status: habitStatusSchema,
    targetDate: z.string(),
    completedAt: instantSchema.nullable(),
    resolvedAt: instantSchema.nullable(),
    stepStatus: habitLogStepStatusSchema.nullable(),
    timeMarks: z.record(z.string(), timeMarkSchema).nullable(),
    createdAt: instantSchema,
});

export const habitLogSchema = habitLogRowSchema.extend({
    id: z.string(),
    userId: z.uuid().optional(),
    stepStatus: habitLogStepStatusSchema.nullable().optional(),
    timeMarks: z.record(z.string(), timeMarkSchema).nullable().optional(),
    resolvedAt: z.string().nullable().optional(),
    createdAt: z.string().optional(),
});
export type HabitLog = z.infer<typeof habitLogSchema>;

export const habitSchema = habitRowSchema.extend({
    linkedAppId: z.string().nullable().optional(),
    linkedUrl: z.string().nullable().optional(),
    shareMode: routineShareModeSchema.nullable().optional(),
    turnOrder: z.array(z.uuid()).nullable().optional(),
    turnsFrom: z.string().nullable().optional(),
    access: listRoleSchema.optional(),
    members: z.array(listMemberSchema).optional(),
    today: routineTodaySchema.optional(),
    days: z.record(z.string(), routineDayShareSchema).optional(),
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
