import { z } from "zod";

/** Search found nothing: ask which recent open task was meant. */
export const didYouMeanQuerySchema = z.object({ query: z.string().trim().min(1).max(200) });

/** Compact canonical note data for local search; an empty entry replaces legacy content. */
export const searchNoteSchema = z.object({
    taskId: z.uuid(),
    terms: z.array(z.string()),
    headings: z.array(z.string()),
});
export type SearchNote = z.infer<typeof searchNoteSchema>;
