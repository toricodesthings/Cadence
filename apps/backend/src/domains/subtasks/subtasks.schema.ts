import { z } from "zod";

export const insertSubtaskSchema = z.object({
    title: z.string().min(1).max(500),
    orderIndex: z.number(),
});

export const updateSubtaskSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    isComplete: z.boolean().optional(),
    orderIndex: z.number().optional(),
});

export const reorderSubtaskSchema = z.object({
    orderIndex: z.number(),
});
