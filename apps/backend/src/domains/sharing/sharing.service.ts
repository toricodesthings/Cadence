import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import type { InvitePreview, ListPerson, ShareRole } from "@cadence/contracts/sharing";
import { listMembers, shareInvites } from "../../db/schema";
import { AppError } from "../../platform/errors";
import { SHARE_CEILINGS, type ListAccess } from "../../platform/list-access";
import type { Tx } from "../../types/db";

const expired = () => new AppError(410, "LINK_EXPIRED", "This link has expired or was reset. Ask for a new one.");

const full = (message: string) => new AppError(413, "SHARE_LIMIT", message);

/** 32 random bytes as base64url (43 characters). */
export function newInviteToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
}

/** Only this is stored, so a database read never yields a working link. */
export async function hashToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint a link that works for 7 days; whoever joins with it gets `role`. Earlier links keep working until they expire; expired rows are pruned here.
 * Returns the token (shown once, never stored) and when it stops working.
 */
export async function createInvite(tx: Tx, userId: string, listId: string, role: ShareRole = "view") {
    await tx
        .delete(shareInvites)
        .where(
            and(
                eq(shareInvites.listId, listId),
                eq(shareInvites.createdBy, userId),
                lte(shareInvites.expiresAt, sql`now()`),
            ),
        );
    const [{ live }] = await tx
        .select({ live: count() })
        .from(shareInvites)
        .where(and(eq(shareInvites.listId, listId), gt(shareInvites.expiresAt, sql`now()`)));
    if (live >= SHARE_CEILINGS.links) throw full("This list has a lot of links out. Reset links to start fresh.");
    const token = newInviteToken();
    const [row] = await tx
        .insert(shareInvites)
        .values({
            tokenHash: await hashToken(token),
            role,
            listId,
            createdBy: userId,
            expiresAt: sql`now() + interval '7 days'`,
        })
        .returning({ expiresAt: shareInvites.expiresAt });
    return { token, expiresAt: row.expiresAt };
}

/** Reset links: every link stops working. */
export async function resetInvites(tx: Tx, userId: string, listId: string) {
    await tx.delete(shareInvites).where(and(eq(shareInvites.listId, listId), eq(shareInvites.createdBy, userId)));
}

/** What a link opens, for the preview screen. 410 when it is unknown, expired or reset. */
export async function previewInvite(tx: Tx, token: string): Promise<InvitePreview> {
    const hash = await hashToken(token);
    const [row] = await tx
        .select({
            listId: sql<string>`r.list_id`,
            name: sql<string>`r.name`,
            emoji: sql<string | null>`r.emoji`,
            colorAccent: sql<string | null>`r.color_accent`,
            ownerId: sql<string>`r.owner_id`,
            ownerName: sql<string | null>`r.owner_name`,
            ownerImage: sql<string | null>`r.owner_image`,
        })
        .from(sql`cadence_invite_preview(${hash}) AS r`);
    if (!row) throw expired();
    return row;
}

/**
 * Join the list a link opens, with the role the link gives. Joining twice, or as the owner, changes nothing. Returns the list id.
 * The ceilings are checked first; the insert itself is the SECURITY DEFINER `cadence_join_list`.
 */
export async function joinList(tx: Tx, userId: string, token: string): Promise<string> {
    const preview = await previewInvite(tx, token);
    if (preview.ownerId !== userId) {
        const [already] = await tx
            .select({ role: listMembers.role })
            .from(listMembers)
            .where(and(eq(listMembers.listId, preview.listId), eq(listMembers.userId, userId)));
        if (!already) {
            // Counted by a definer function: row-level security shows a person who isn't in the list none of it.
            const [{ people, joined }] = await tx
                .select({
                    people: sql<number>`r.people`.mapWith(Number),
                    joined: sql<number>`r.joined`.mapWith(Number),
                })
                .from(sql`cadence_join_counts(${preview.listId}::uuid) AS r`);
            // The owner counts as a person in the list.
            if (people + 1 >= SHARE_CEILINGS.people) throw full("This list has as many people as it can hold.");
            if (joined >= SHARE_CEILINGS.listsJoined)
                throw full("You have joined as many lists as an account can hold.");
        }
    }
    const [row] = await tx
        .select({ listId: sql<string | null>`r.id` })
        .from(sql`cadence_join_list(${await hashToken(token)}) AS r(id)`);
    if (!row?.listId) throw expired();
    return row.listId;
}

export async function setMemberRole(tx: Tx, listId: string, memberId: string, role: ShareRole) {
    const [row] = await tx
        .update(listMembers)
        .set({ role })
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, memberId)))
        .returning({ userId: listMembers.userId, role: listMembers.role, invitedBy: listMembers.invitedBy });
    if (!row) throw new AppError(404, "NOT_FOUND", "Person not found in this list");
    return row;
}

export async function removeMember(tx: Tx, listId: string, memberId: string) {
    const rows = await tx
        .delete(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, memberId)))
        .returning({ userId: listMembers.userId });
    if (!rows.length) throw new AppError(404, "NOT_FOUND", "Person not found in this list");
}

/** Stop sharing: everyone is removed and every link dies. */
export async function stopSharing(tx: Tx, userId: string, access: ListAccess) {
    await tx.delete(listMembers).where(eq(listMembers.listId, access.listId));
    await resetInvites(tx, userId, access.listId);
}

/** The owner and every member, as the people in the list see each other. Never email or birthday. */
export async function listPeople(tx: Tx, listId: string): Promise<ListPerson[]> {
    return tx
        .select({
            userId: sql<string>`r.user_id`,
            name: sql<string | null>`r.name`,
            image: sql<string | null>`r.image`,
            pronouns: sql<string | null>`r.pronouns`,
            role: sql<ListPerson["role"]>`r.role`,
        })
        .from(sql`cadence_list_people(${listId}::uuid) AS r`);
}
