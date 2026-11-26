import { z } from "zod";
import { localDateSchema } from "./common";
import { listMemberSchema, listRoleSchema } from "./sharing";

export const personalEventSchema = z.object({
    id: z.uuid(),
    label: z.string().min(1).max(80),
    monthDay: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
    emoji: z.string().max(4).nullable(),
    notify: z.boolean(),
    startedOn: localDateSchema.nullable(),
    color: z.string().max(30).nullable().optional(),
});
export type PersonalEvent = z.infer<typeof personalEventSchema>;

export const sharedEventSchema = personalEventSchema.extend({
    access: listRoleSchema,
    members: z.array(listMemberSchema),
});
export type SharedEvent = z.infer<typeof sharedEventSchema>;

export const insertPersonalEventSchema = personalEventSchema
    .omit({ id: true })
    .extend({
        id: z.uuid().optional(),
        emoji: personalEventSchema.shape.emoji.optional(),
        notify: z.boolean().optional(),
        startedOn: personalEventSchema.shape.startedOn.optional(),
    })
    .strict();
export type InsertPersonalEvent = z.infer<typeof insertPersonalEventSchema>;

export const updatePersonalEventSchema = personalEventSchema.omit({ id: true }).partial().strict();
export type UpdatePersonalEvent = z.infer<typeof updatePersonalEventSchema>;
