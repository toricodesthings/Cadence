import { z } from "zod";

export const insertProjectSchema = z.object({
    name: z.string().min(1).max(200),
    colorAccent: z.string().max(50).default("luminous-amber"),
    emoji: z.string().max(10).optional(),
});
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const updateProjectSchema = insertProjectSchema.partial();
export type UpdateProject = z.infer<typeof updateProjectSchema>;
