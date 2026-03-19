import { z } from "zod";

export const createHabitSchema = z.object({
    title: z.string().min(1, "Name is required").max(100, "Name is too long"),
    description: z.string().max(500, "Description is too long").optional(),
    recurrenceRule: z.string().min(1, "Recurrence is required"),
    colorAccent: z.enum(["lantern", "glacier", "emerald", "amethyst", "rose", "sage"]),
    targetTime: z.string().optional().nullable(),
    reminderEnabled: z.boolean().optional(),
    projectId: z.string().uuid().optional().nullable(),
    tagIds: z.array(z.string().uuid()).optional(),
});

export type CreateHabitValues = z.infer<typeof createHabitSchema>;
