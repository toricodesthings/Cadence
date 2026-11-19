import { z } from "zod";
import { instantSchema } from "./common";
import { listMemberSchema, listRoleSchema } from "./sharing";

// No .default()s on create schemas: an omitted field takes its DB column default, and
// a default here would leak into the .partial() update schema and overwrite data.
export const insertProjectSchema = z.object({
    /** Client-chosen id, so it can be used before it syncs. */
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(200),
    colorAccent: z.string().max(50).optional(),
    // emoji is nullable in the DB — allow null on write to clear it.
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

// Entity mirrors the DB truthfully: `colorAccent`/`emoji` are nullable. Consumers
// coalesce to a fallback at the presentation edge.
export const projectSchema = projectRowSchema.extend({
    /** The caller's role in this list. */
    access: listRoleSchema,
    /** Everyone the list is shared with (the owner is `userId`); empty when unshared. */
    members: z.array(listMemberSchema),
});
export type Project = z.infer<typeof projectSchema>;

export type CreateProjectInput = z.input<typeof insertProjectSchema>;
