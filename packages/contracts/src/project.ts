import { z } from "zod";
import { instantSchema } from "./common";
import { listMemberSchema, listRoleSchema } from "./sharing";

export const insertProjectSchema = z.object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(200),
    colorAccent: z.string().max(50).optional(),
    emoji: z.string().max(10).nullable().optional(),
});
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const updateProjectSchema = insertProjectSchema.omit({ id: true }).partial();
export type UpdateProject = z.infer<typeof updateProjectSchema>;

export const projectRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    colorAccent: z.string().nullable(),
    emoji: z.string().nullable(),
    createdAt: instantSchema,
});
export type ProjectRow = z.infer<typeof projectRowSchema>;

export const projectSchema = projectRowSchema.extend({
    access: listRoleSchema,
    members: z.array(listMemberSchema),
});
export type Project = z.infer<typeof projectSchema>;

export type CreateProjectInput = z.input<typeof insertProjectSchema>;
