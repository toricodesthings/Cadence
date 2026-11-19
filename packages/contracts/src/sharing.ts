import { z } from "zod";
import { instantSchema } from "./common";

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

export const invitePreviewSchema = z.object({
    listId: z.uuid(),
    name: z.string(),
    emoji: z.string().nullable(),
    colorAccent: z.string().nullable(),
    ownerId: z.uuid(),
    ownerName: z.string().nullable(),
    ownerImage: z.string().nullable(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** 32 random bytes as base64url. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const joinListSchema = z.object({ token: inviteTokenSchema });
export const invitePreviewQuerySchema = z.object({ token: inviteTokenSchema });
export const setMemberRoleSchema = z.object({ role: shareRoleSchema });
/** What a link lets people do once they join. No body: they can view. */
export const createInviteSchema = z.object({ role: shareRoleSchema.default("view") });
export const listMemberParamSchema = z.object({ id: z.uuid(), userId: z.uuid() });
