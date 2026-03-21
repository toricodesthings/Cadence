import { z } from "zod";

export const resolveSuggestionSchema = z.object({
    status: z.enum(["ACCEPTED", "DISMISSED"]),
});
export type ResolveSuggestion = z.infer<typeof resolveSuggestionSchema>;
