import { z } from "zod";
import { instantSchema } from "./common";

export const insertSubtaskSchema = z.object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1).max(500),
    orderIndex: z.number(),
});

const subtaskTaskIdsSchema = z.array(z.uuid()).max(200);

export const subtasksByTaskQuerySchema = z.object({
    taskIds: z
        .string()
        .transform((ids) => ids.split(",").filter(Boolean))
        .pipe(subtaskTaskIdsSchema),
});

export const bulkSubtasksSchema = z.object({ taskIds: subtaskTaskIdsSchema });

export const updateSubtaskSchema = z.object({
    title: z.string().trim().min(1).max(500).optional(),
    isComplete: z.boolean().optional(),
    orderIndex: z.number().optional(),
});

export const reorderSubtaskSchema = z.object({
    orderIndex: z.number(),
});

export const subtaskRowSchema = z.object({
    id: z.uuid(),
    taskId: z.uuid(),
    userId: z.uuid(),
    title: z.string(),
    isComplete: z.boolean(),
    orderIndex: z.number(),
    createdBy: z.uuid().nullable(),
    createdAt: instantSchema,
});
export type SubtaskRow = z.infer<typeof subtaskRowSchema>;

export const subtaskSchema = subtaskRowSchema.extend({
    userId: z.uuid().optional(),
    createdBy: z.uuid().nullable().optional(),
});
export type Subtask = z.infer<typeof subtaskSchema>;
