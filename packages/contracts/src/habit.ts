import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

export const habitStatusSchema = z.enum(["COMPLETED", "SKIPPED", "PENDING"]);
export type HabitStatus = z.infer<typeof habitStatusSchema>;

export const targetModeSchema = z.enum(["AMBIENT", "ANCHOR", "BLOCK"]);
export type TargetMode = z.infer<typeof targetModeSchema>;

export const insertHabitSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(10_000).nullable().optional(),
    notes: z.string().nullable().optional(),
    recurrenceRule: z.string().max(500),
    targetTime: z.string().max(30).nullable().optional(),
    targetMode: targetModeSchema.default("AMBIENT").optional(),
    reminderEnabled: z.boolean().default(false),
    colorAccent: z.string().default("lantern"),
    archived: z.boolean().default(false).optional(),
    projectId: z.string().uuid().nullable().optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    sortOrder: z.number().optional(),
    pausedUntil: z.string().nullable().optional(),
});
// FE-facing input type uses z.input so server-defaulted fields (reminderEnabled,
// colorAccent, targetMode) stay optional for clients building request bodies.
export type InsertHabit = z.input<typeof insertHabitSchema>;

export const updateHabitSchema = insertHabitSchema.partial().extend({
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
});
export type UpdateHabit = z.input<typeof updateHabitSchema>;

export const resolveHabitActionSchema = z.object({
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/), // YYYY-MM-DD or full ISO datetime — server truncates to date
    status: habitStatusSchema,
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

export const monthlyHabitsQuerySchema = z.object({
    year: z.coerce.number().int().min(2020).max(2100),
    month: z.coerce.number().int().min(0).max(11), // 0-indexed (JS Date convention)
});

export const unresolvedQuerySchema = z.object({
    timezone: z.string().optional().default("UTC"),
});

// ── Row schema (exact DB columns) ──
export const habitRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    title: z.string(),
    description: z.string().nullable(),
    recurrenceRule: z.string(),
    targetTime: z.string().nullable(),
    targetMode: targetModeSchema,
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
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
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

export const unresolvedHabitSummarySchema = z.object({
    habitId: z.uuid(),
    title: z.string(),
    targetTime: z.string().nullable(),
    targetMode: z.string(),
    latestTargetDate: z.string(),
    missedCount: z.number(),
    actionableDates: z.array(z.string()),
});
export type UnresolvedHabitSummary = z.infer<typeof unresolvedHabitSummarySchema>;
