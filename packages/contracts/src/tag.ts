import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

export const insertTagSchema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().max(50).default("default"),
});
export type InsertTag = z.infer<typeof insertTagSchema>;

export const updateTagSchema = insertTagSchema.partial();
export type UpdateTag = z.infer<typeof updateTagSchema>;

export const taskTagSchema = z.object({
    tagId: z.string().uuid(),
});
export type TaskTagInput = z.infer<typeof taskTagSchema>;

export const tagRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    color: z.string().nullable(),
    createdAt: isoDateTime,
});
export type TagRow = z.infer<typeof tagRowSchema>;

// Entity mirrors the DB truthfully: `color` is nullable (the column has a default
// but is not NOT NULL). Consumers coalesce to a fallback at the presentation edge.
export const tagSchema = tagRowSchema;
export type Tag = z.infer<typeof tagSchema>;

export const createTagInputSchema = insertTagSchema;
export type CreateTagInput = z.input<typeof insertTagSchema>;
