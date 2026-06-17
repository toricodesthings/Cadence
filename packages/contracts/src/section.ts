import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

export const sectionQuerySchema = z.object({
    projectId: z.string().uuid().optional(),
});
export type SectionQuery = z.infer<typeof sectionQuerySchema>;

export const createSectionSchema = z.object({
    name: z.string().min(1).max(200),
    orderIndex: z.number(),
    projectId: z.string().uuid().nullable().optional(),
});
export type CreateSection = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    orderIndex: z.number().optional(),
});
export type UpdateSection = z.infer<typeof updateSectionSchema>;

export const taskSectionRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    projectId: z.uuid().nullable(),
    name: z.string(),
    orderIndex: z.number(),
    createdAt: isoDateTime,
});
export type TaskSectionRow = z.infer<typeof taskSectionRowSchema>;

export const taskSectionSchema = taskSectionRowSchema;
export type TaskSection = z.infer<typeof taskSectionSchema>;
