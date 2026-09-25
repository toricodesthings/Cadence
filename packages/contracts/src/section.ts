import { z } from "zod";
import { isoDateTimeSchema } from "./common";

export const sectionQuerySchema = z.object({
    projectId: z.uuid().optional(),
});

export const createSectionSchema = z.object({
    name: z.string().min(1).max(200),
    orderIndex: z.number(),
    projectId: z.uuid().nullable().optional(),
});

export const updateSectionSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    orderIndex: z.number().optional(),
});

export const taskSectionRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    projectId: z.uuid().nullable(),
    name: z.string(),
    orderIndex: z.number(),
    createdAt: isoDateTimeSchema,
});

export const taskSectionSchema = taskSectionRowSchema;
export type TaskSection = z.infer<typeof taskSectionSchema>;
