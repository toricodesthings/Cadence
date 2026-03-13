import { z } from "zod";

export const habitStatusSchema = z.enum(["COMPLETED", "SKIPPED", "PENDING"]);
export type HabitStatus = z.infer<typeof habitStatusSchema>;

export const insertHabitSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(10_000).nullable().optional(),
    notes: z.string().nullable().optional(),
    recurrenceRule: z.string().max(500),
    targetTime: z.string().max(30).nullable().optional(),
    reminderEnabled: z.boolean().default(false),
    colorAccent: z.string().default("lantern"),
    archived: z.boolean().default(false).optional(),
});
export type InsertHabit = z.infer<typeof insertHabitSchema>;

export const updateHabitSchema = insertHabitSchema.partial();
export type UpdateHabit = z.infer<typeof updateHabitSchema>;

export const resolveHabitActionSchema = z.object({
    targetDate: z.string().datetime({ offset: true }), // the ISO date preserving timezone or string
    status: habitStatusSchema,
});
export type ResolveHabitAction = z.infer<typeof resolveHabitActionSchema>;

export const weeklyHabitsQuerySchema = z.object({
    start: z.string().min(1), // e.g., YYYY-MM-DD
    end: z.string().min(1),
    archived: z.string().optional().default("false").transform(v => v === "true"),
});

export const habitListQuerySchema = z.object({
    archived: z.string().optional().default("false").transform(v => v === "true"),
});

export const monthlyHabitsQuerySchema = z.object({
    year: z.coerce.number().int().min(2020).max(2100),
    month: z.coerce.number().int().min(0).max(11), // 0-indexed (JS Date convention)
});
