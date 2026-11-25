import { z } from "zod";
import { localDateSchema } from "./common";
import { listMemberSchema, listRoleSchema } from "./sharing";

export const personalEventSchema = z.object({
    id: z.uuid(),
    label: z.string().min(1).max(80),
    monthDay: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/), // "MM-DD"
    emoji: z.string().max(4).nullable(),
    notify: z.boolean(),
    startedOn: localDateSchema.nullable(),
    // A palette key like the routine colours; missing or null means no colour (the default tint).
    color: z.string().max(30).nullable().optional(),
});
export type PersonalEvent = z.infer<typeof personalEventSchema>;

export const sharedEventSchema = personalEventSchema.extend({
    access: listRoleSchema,
    members: z.array(listMemberSchema),
});
export type SharedEvent = z.infer<typeof sharedEventSchema>;

// No .default()s on create schemas: an omitted field takes its DB column default.
export const insertPersonalEventSchema = personalEventSchema
    .omit({ id: true })
    .extend({
        /** Client-chosen id, so it can be used before it syncs. */
        id: z.uuid().optional(),
        emoji: personalEventSchema.shape.emoji.optional(),
        notify: z.boolean().optional(),
        startedOn: personalEventSchema.shape.startedOn.optional(),
    })
    .strict();
export type InsertPersonalEvent = z.infer<typeof insertPersonalEventSchema>;

export const updatePersonalEventSchema = personalEventSchema.omit({ id: true }).partial().strict();
export type UpdatePersonalEvent = z.infer<typeof updatePersonalEventSchema>;
