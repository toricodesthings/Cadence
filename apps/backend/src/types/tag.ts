import { z } from "zod";

export const insertTagSchema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().max(50).default("default"),
});
export type InsertTag = z.infer<typeof insertTagSchema>;

export const updateTagSchema = insertTagSchema.partial();
export type UpdateTag = z.infer<typeof updateTagSchema>;

export const taskTagSchema = z.object({
    tagId: z.string().uuid(),
});
export type TaskTagInput = z.infer<typeof taskTagSchema>;
