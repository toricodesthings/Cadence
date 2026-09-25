import { z } from "zod";
import { isoDateTimeSchema } from "./common";

// No .default()s on create schemas: an omitted field takes its DB column default, and
// a default here would leak into the .partial() update schema and overwrite data.
export const insertTagSchema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().max(50).optional(),
});
export type InsertTag = z.infer<typeof insertTagSchema>;

export const updateTagSchema = insertTagSchema.partial();
export type UpdateTag = z.infer<typeof updateTagSchema>;

export const taskTagSchema = z.object({
    tagId: z.uuid(),
});

export const tagRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    color: z.string().nullable(),
    createdAt: isoDateTimeSchema,
});
export type TagRow = z.infer<typeof tagRowSchema>;

// Entity mirrors the DB truthfully: `color` is nullable (the column has a default
// but is not NOT NULL). Consumers coalesce to a fallback at the presentation edge.
export const tagSchema = tagRowSchema;
export type Tag = z.infer<typeof tagSchema>;

export type CreateTagInput = z.input<typeof insertTagSchema>;
