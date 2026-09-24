import { z } from "zod";
import { isoDateTimeSchema } from "./common";

export const upsertNoteSchema = z.object({
    body: z.string().max(50_000),
    expectedUpdatedAt: z.string().optional(),
    /** The note version the writer last read; 0 = "there was no note". A mismatch is a 409. */
    expectedVersion: z.number().int().min(0).optional(),
});
export type UpsertNote = z.infer<typeof upsertNoteSchema>;

export const taskNoteRowSchema = z.object({
    id: z.uuid(),
    taskId: z.uuid(),
    userId: z.uuid(),
    body: z.string(),
    excerpt: z.string(),
    wordCount: z.number().int(),
    headingCount: z.number().int(),
    version: z.number().int(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});
export type TaskNoteRow = z.infer<typeof taskNoteRowSchema>;

export const taskNoteSchema = taskNoteRowSchema;
export type TaskNote = z.infer<typeof taskNoteSchema>;
