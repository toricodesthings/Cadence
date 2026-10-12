import { z } from "zod";

/** Search found nothing: ask which recent open task was meant. */
export const didYouMeanQuerySchema = z.object({ query: z.string().trim().min(1).max(200) });
