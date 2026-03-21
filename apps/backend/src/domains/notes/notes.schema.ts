import { z } from "zod";

export const upsertNoteSchema = z.object({
    body: z.string().max(50_000),
    expectedUpdatedAt: z.string().optional(),
});
export type UpsertNote = z.infer<typeof upsertNoteSchema>;
