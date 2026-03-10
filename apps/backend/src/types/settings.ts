import { z } from "zod";

export const settingsPatchSchema = z.object({
    profile: z.object({
        pronouns: z.string().optional(),
    }).partial().optional(),
    tasks: z.object({
        defaultDueDate: z.enum(["None", "Today", "Tomorrow", "Next Week"]).nullable().optional(),
        hideTrash: z.boolean().optional(),
        hideCompleted: z.boolean().optional(),
    }).partial().optional(),
    dateTime: z.object({
        weekStart: z.enum(["Sunday", "Monday", "Saturday"]).optional(),
        timezone: z.string().optional(),
        timeDisplay: z.enum(["12h", "24h"]).optional(),
    }).partial().optional(),
    notifications: z.object({
        email: z.boolean().optional(),
    }).partial().optional(),
    shortcuts: z.record(z.string(), z.string()).optional(),
    preferredView: z.enum(["list", "kanban"]).optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
