import { z } from "zod";
import { instantSchema, localDateSchema } from "./common";

/** In ascending order: it mirrors the `share_role` enum, whose order the SQL compares (`role >= min_role`). */
export const shareRoleSchema = z.enum(["view", "edit"]);
export type ShareRole = z.infer<typeof shareRoleSchema>;

/** The caller's role in a list: the owner isn't a member row. */
export const listRoleSchema = z.enum(["owner", ...shareRoleSchema.options]);
export type ListRole = z.infer<typeof listRoleSchema>;

export const listMemberSchema = z.object({
    userId: z.uuid(),
    role: shareRoleSchema,
    invitedBy: z.uuid().nullable(),
});
export type ListMember = z.infer<typeof listMemberSchema>;

/** What another member sees of a person: never email or birthday. */
export const listPersonSchema = z.object({
    userId: z.uuid(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    pronouns: z.string().nullable(),
    role: listRoleSchema,
});
export type ListPerson = z.infer<typeof listPersonSchema>;

export const inviteSchema = z.object({ url: z.string(), expiresAt: instantSchema });
export type Invite = z.infer<typeof inviteSchema>;

const inviteOwnerFields = {
    ownerId: z.uuid(),
    ownerName: z.string().nullable(),
    ownerImage: z.string().nullable(),
};

export const listInvitePreviewSchema = z
    .object({
        kind: z.literal("list"),
        listId: z.uuid(),
        name: z.string(),
        emoji: z.string().nullable(),
        colorAccent: z.string().nullable(),
        ...inviteOwnerFields,
    })
    .strict();
export type ListInvitePreview = z.infer<typeof listInvitePreviewSchema>;

export const eventInvitePreviewSchema = z
    .object({
        kind: z.literal("event"),
        eventId: z.uuid(),
        label: z.string(),
        emoji: z.string().nullable(),
        monthDay: z.string(),
        startedOn: localDateSchema.nullable(),
        color: z.string().nullable(),
        ...inviteOwnerFields,
    })
    .strict();
export type EventInvitePreview = z.infer<typeof eventInvitePreviewSchema>;

export const routineShareWaySchema = z.enum(["together", "turns", "cheering"]);
export type RoutineShareWay = z.infer<typeof routineShareWaySchema>;

export const routineInvitePreviewSchema = z
    .object({
        kind: z.literal("routine"),
        routineId: z.uuid(),
        title: z.string(),
        emoji: z.string().nullable(),
        colorAccent: z.string().nullable(),
        recurrenceRule: z.string(),
        targetTime: z.string().nullable(),
        times: z.array(z.string()).nullable(),
        way: routineShareWaySchema,
        ...inviteOwnerFields,
        people: z.array(z.object({ name: z.string().nullable(), image: z.string().nullable() })),
    })
    .strict();
export type RoutineInvitePreview = z.infer<typeof routineInvitePreviewSchema>;

export const invitePreviewSchema = z.discriminatedUnion("kind", [
    listInvitePreviewSchema,
    eventInvitePreviewSchema,
    routineInvitePreviewSchema,
]);
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

export const joinedSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("list"), listId: z.uuid() }),
    z.object({ kind: z.literal("event"), eventId: z.uuid() }),
    z.object({ kind: z.literal("routine"), routineId: z.uuid() }),
]);
export type Joined = z.infer<typeof joinedSchema>;

export const createRoutineInviteSchema = z.object({ way: routineShareWaySchema });

/** 32 random bytes as base64url. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const joinListSchema = z.object({ token: inviteTokenSchema });
export const invitePreviewQuerySchema = z.object({ token: inviteTokenSchema });
export const setMemberRoleSchema = z.object({ role: shareRoleSchema });
/** What a link lets people do once they join. No body: they can view. */
export const createInviteSchema = z.object({ role: shareRoleSchema.default("view") });
export const transferListSchema = z.object({ userId: z.uuid() });
export const listMemberParamSchema = z.object({ id: z.uuid(), userId: z.uuid() });
