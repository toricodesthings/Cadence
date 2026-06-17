import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

export const upsertNoteSchema = z.object({
    body: z.string().max(50_000),
    expectedUpdatedAt: z.string().optional(),
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
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
});
export type TaskNoteRow = z.infer<typeof taskNoteRowSchema>;

export const taskNoteSchema = taskNoteRowSchema;
export type TaskNote = z.infer<typeof taskNoteSchema>;
