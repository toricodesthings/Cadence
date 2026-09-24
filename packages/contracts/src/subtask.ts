import { z } from "zod";
import { isoDateTimeSchema } from "./common";

export const insertSubtaskSchema = z.object({
    title: z.string().min(1).max(500),
    orderIndex: z.number(),
});

const subtaskTaskIdsSchema = z.array(z.string().uuid()).max(200);

/** `GET /subtasks?taskIds=a,b`: at most 200 ids (about 7.5KB of URL). */
export const subtasksByTaskQuerySchema = z.object({
    taskIds: z.string().transform((ids) => ids.split(",").filter(Boolean)).pipe(subtaskTaskIdsSchema),
});

/** Body of the legacy `POST /subtasks/bulk`, still called by older desktop builds. */
export const bulkSubtasksSchema = z.object({ taskIds: subtaskTaskIdsSchema });

export const updateSubtaskSchema = z.object({
    title: z.string().min(1).max(500).optional(),
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
    createdAt: isoDateTimeSchema,
});
export type SubtaskRow = z.infer<typeof subtaskRowSchema>;

// `userId` is optional on the client entity (optimistic caches build subtasks
// without it); the Row keeps it required for DB parity.
export const subtaskSchema = subtaskRowSchema.extend({ userId: z.uuid().optional() });
export type Subtask = z.infer<typeof subtaskSchema>;
