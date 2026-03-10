import { z } from 'zod';

export const UserSettingsSchema = z.object({
    profile: z.object({
        pronouns: z.string().optional(),
    }).optional(),
    tasks: z.object({
        defaultDueDate: z.enum(['None', 'Today', 'Tomorrow', 'Next Week']).nullable(),
        hideTrash: z.boolean(),
        hideCompleted: z.boolean(),
    }),
    dateTime: z.object({
        weekStart: z.enum(['Sunday', 'Monday', 'Saturday']),
        timezone: z.string(),
        timeDisplay: z.enum(['12h', '24h']),
    }),
    notifications: z.object({
        email: z.boolean(),
    }),
    shortcuts: z.record(z.string(), z.string()),
    preferredView: z.enum(['list', 'kanban']).optional(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

// Need a DeepPartial for type-safe patch bodies
export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
