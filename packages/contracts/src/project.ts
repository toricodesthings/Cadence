import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

export const insertProjectSchema = z.object({
    name: z.string().min(1).max(200),
    colorAccent: z.string().max(50).default("luminous-amber"),
    // emoji is nullable in the DB — allow null on write to clear it.
    emoji: z.string().max(10).nullable().optional(),
});
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const updateProjectSchema = insertProjectSchema.partial();
export type UpdateProject = z.infer<typeof updateProjectSchema>;

export const projectRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    colorAccent: z.string().nullable(),
    emoji: z.string().nullable(),
    createdAt: isoDateTime,
});
export type ProjectRow = z.infer<typeof projectRowSchema>;

// Entity mirrors the DB truthfully: `colorAccent`/`emoji` are nullable. Consumers
// coalesce to a fallback at the presentation edge.
export const projectSchema = projectRowSchema;
export type Project = z.infer<typeof projectSchema>;

export const createProjectInputSchema = insertProjectSchema;
export type CreateProjectInput = z.input<typeof insertProjectSchema>;
