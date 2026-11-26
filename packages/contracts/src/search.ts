import { z } from "zod";

export const didYouMeanQuerySchema = z.object({ query: z.string().trim().min(1).max(200) });

export const searchNoteSchema = z.object({
    taskId: z.uuid(),
    terms: z.array(z.string()),
    headings: z.array(z.string()),
});
export type SearchNote = z.infer<typeof searchNoteSchema>;
