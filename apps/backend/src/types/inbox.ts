import { z } from "zod";

export const insertInboxItemSchema = z.object({
    rawText: z.string().min(1).max(5_000),
    sectionId: z.string().uuid().optional(),
    orderIndex: z.number().optional(),
    clientMutationId: z.string().max(100).optional(),
});
export type InsertInboxItem = z.infer<typeof insertInboxItemSchema>;

export const updateInboxItemSchema = z.object({
    rawText: z.string().min(1).max(5_000).optional(),
    sectionId: z.string().uuid().nullable().optional(),
    orderIndex: z.number().optional(),
});
export type UpdateInboxItem = z.infer<typeof updateInboxItemSchema>;

export const insertInboxSectionSchema = z.object({
    name: z.string().min(1).max(200),
    orderIndex: z.number().optional(),
    clientMutationId: z.string().max(100).optional(),
});
export type InsertInboxSection = z.infer<typeof insertInboxSectionSchema>;

export const updateInboxSectionSchema = insertInboxSectionSchema.partial();
export type UpdateInboxSection = z.infer<typeof updateInboxSectionSchema>;
