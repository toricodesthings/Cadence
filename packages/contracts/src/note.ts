import { z } from "zod";
import { instantSchema } from "./common";

export const upsertNoteSchema = z.object({
    body: z.string().max(50_000),
    expectedUpdatedAt: z.string().optional(),
});

export const taskNoteRowSchema = z.object({
    id: z.uuid(),
    taskId: z.uuid(),
    userId: z.uuid(),
    body: z.string(),
    excerpt: z.string(),
    wordCount: z.number().int(),
    headingCount: z.number().int(),
    version: z.number().int(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});

export const taskNoteSchema = taskNoteRowSchema;
export type TaskNote = z.infer<typeof taskNoteSchema>;
