import { z } from "zod";
import { instantSchema } from "./common";

export const NOTE_MAX_CHARS = 50_000;

export const upsertNoteSchema = z.object({
    body: z.string().max(NOTE_MAX_CHARS),
    expectedVersion: z.number().int().min(0).optional(),
    expectedUpdatedAt: instantSchema.optional(),
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
    updatedBy: z.uuid().nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});

export const taskNoteSchema = taskNoteRowSchema.extend({ updatedBy: z.uuid().nullable().optional() });
export type TaskNote = z.infer<typeof taskNoteSchema>;
