import { and, count, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { InvitePreview, Joined, ListPerson, RoutineShareWay, ShareRole } from "@cadence/contracts/sharing";
import { eventMembers, habits, listMembers, routineMembers, shareInvites, tasks } from "../../db/schema";
import { AppError } from "../../platform/errors";
import { SHARE_CEILINGS, type EventAccess, type ListAccess, type RoutineAccess } from "../../platform/list-access";
import type { Tx } from "../../types/db";

export type InviteTarget = { listId: string } | { eventId: string } | { routineId: string };

const targetWhere = (target: InviteTarget) => {
    if ("listId" in target) return eq(shareInvites.listId, target.listId);
    if ("eventId" in target) return eq(shareInvites.eventId, target.eventId);
    return eq(shareInvites.routineId, target.routineId);
};

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
export async function createInvite(tx: Tx, userId: string, target: InviteTarget, role: ShareRole = "view") {
    const scope = targetWhere(target);
    await tx
        .delete(shareInvites)
        .where(and(scope, eq(shareInvites.createdBy, userId), lte(shareInvites.expiresAt, sql`now()`)));
    const [{ live }] = await tx
        .select({ live: count() })
        .from(shareInvites)
        .where(and(scope, gt(shareInvites.expiresAt, sql`now()`)));
    if (live >= SHARE_CEILINGS.links) {
        const what = "listId" in target ? "list" : "eventId" in target ? "date" : "routine";
        throw full(`This ${what} has a lot of links out. Reset links to start fresh.`);
    }
    const token = newInviteToken();
    const [row] = await tx
        .insert(shareInvites)
        .values({
            tokenHash: await hashToken(token),
            role,
            ...target,
            createdBy: userId,
            expiresAt: sql`now() + interval '7 days'`,
        })
        .returning({ expiresAt: shareInvites.expiresAt });
    return { token, expiresAt: row.expiresAt };
}

/** Reset links: every link stops working. */
export async function resetInvites(tx: Tx, userId: string, target: InviteTarget) {
    await tx.delete(shareInvites).where(and(targetWhere(target), eq(shareInvites.createdBy, userId)));
}

/** What a link opens, for the preview screen. 410 when it is unknown, expired or reset. */
export async function previewInvite(tx: Tx, token: string): Promise<InvitePreview> {
    const hash = await hashToken(token);
    const [listRow] = await tx
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
    if (listRow) return { kind: "list", ...listRow };

    const [eventRow] = await tx
        .select({
            eventId: sql<string>`r.event_id`,
            label: sql<string>`r.label`,
            emoji: sql<string | null>`r.emoji`,
            monthDay: sql<string>`r.month_day`,
            startedOn: sql<string | null>`r.started_on::text`,
            color: sql<string | null>`r.color`,
            ownerId: sql<string>`r.owner_id`,
            ownerName: sql<string | null>`r.owner_name`,
            ownerImage: sql<string | null>`r.owner_image`,
        })
        .from(sql`cadence_event_invite_preview(${hash}) AS r`);
    if (eventRow) return { kind: "event", ...eventRow };

    const [routineRow] = await tx
        .select({
            routineId: sql<string>`r.routine_id`,
            title: sql<string>`r.title`,
            emoji: sql<string | null>`r.emoji`,
            colorAccent: sql<string | null>`r.color_accent`,
            recurrenceRule: sql<string>`r.recurrence_rule`,
            targetTime: sql<string | null>`r.target_time`,
            times: sql<string[] | null>`r.times`,
            linkRole: sql<string>`r.link_role`,
            shareMode: sql<string | null>`r.share_mode`,
            ownerId: sql<string>`r.owner_id`,
            ownerName: sql<string | null>`r.owner_name`,
            ownerImage: sql<string | null>`r.owner_image`,
            people: sql<Array<{ name: string | null; image: string | null }>>`r.people`,
        })
        .from(sql`cadence_routine_invite_preview(${hash}) AS r`);
    if (routineRow) {
        const way: RoutineShareWay =
            routineRow.linkRole === "view" ? "cheering" : routineRow.shareMode === "turns" ? "turns" : "together";
        return {
            kind: "routine",
            routineId: routineRow.routineId,
            title: routineRow.title,
            emoji: routineRow.emoji,
            colorAccent: routineRow.colorAccent,
            recurrenceRule: routineRow.recurrenceRule,
            targetTime: routineRow.targetTime,
            times: routineRow.times,
            way,
            ownerId: routineRow.ownerId,
            ownerName: routineRow.ownerName,
            ownerImage: routineRow.ownerImage,
            people: routineRow.people ?? [],
        };
    }

    throw expired();
}

/**
 * Join the list or event a link opens. Joining twice, or as the owner, changes nothing.
 * The ceilings are checked first; the insert itself is SECURITY DEFINER (`cadence_join_list` / `cadence_join_event`).
 */
async function assertJoinCapacity(
    tx: Tx,
    countsQuery: ReturnType<typeof sql>,
    maxJoined: number,
    peopleMessage: string,
    joinedMessage: string,
) {
    // Counted by a definer function: row-level security shows a non-member none of the resource.
    const [{ people, joined }] = await tx
        .select({
            people: sql<number>`r.people`.mapWith(Number),
            joined: sql<number>`r.joined`.mapWith(Number),
        })
        .from(countsQuery);
    // The owner counts as a person.
    if (people + 1 >= SHARE_CEILINGS.people) throw full(peopleMessage);
    if (joined >= maxJoined) throw full(joinedMessage);
}

/**
 * Join a list, event, or routine from an invite link.
 */
export async function joinInvite(tx: Tx, userId: string, token: string): Promise<Joined> {
    const preview = await previewInvite(tx, token);
    const hash = await hashToken(token);

    if (preview.kind === "list") {
        if (preview.ownerId !== userId) {
            const [already] = await tx
                .select({ role: listMembers.role })
                .from(listMembers)
                .where(and(eq(listMembers.listId, preview.listId), eq(listMembers.userId, userId)));
            if (!already) {
                await assertJoinCapacity(
                    tx,
                    sql`cadence_join_counts(${preview.listId}::uuid) AS r`,
                    SHARE_CEILINGS.listsJoined,
                    "This list has as many people as it can hold.",
                    "You have joined as many lists as an account can hold.",
                );
            }
        }
        const [row] = await tx
            .select({ listId: sql<string | null>`r.id` })
            .from(sql`cadence_join_list(${hash}) AS r(id)`);
        if (!row?.listId) throw expired();
        return { kind: "list", listId: row.listId };
    }

    if (preview.kind === "event") {
        if (preview.ownerId !== userId) {
            const [already] = await tx
                .select({ role: eventMembers.role })
                .from(eventMembers)
                .where(and(eq(eventMembers.eventId, preview.eventId), eq(eventMembers.userId, userId)));
            if (!already) {
                await assertJoinCapacity(
                    tx,
                    sql`cadence_event_join_counts(${preview.eventId}::uuid) AS r`,
                    SHARE_CEILINGS.eventsJoined,
                    "This date is shared with as many people as it can hold.",
                    "You've added as many shared dates as an account can hold.",
                );
            }
        }
        const [row] = await tx
            .select({ eventId: sql<string | null>`r.id` })
            .from(sql`cadence_join_event(${hash}) AS r(id)`);
        if (!row?.eventId) throw expired();
        return { kind: "event", eventId: row.eventId };
    }

    if (preview.ownerId !== userId) {
        const [already] = await tx
            .select({ role: routineMembers.role })
            .from(routineMembers)
            .where(and(eq(routineMembers.habitId, preview.routineId), eq(routineMembers.userId, userId)));
        if (!already) {
            await assertJoinCapacity(
                tx,
                sql`cadence_routine_join_counts(${preview.routineId}::uuid) AS r`,
                SHARE_CEILINGS.routinesJoined,
                "This routine is shared with as many people as it can hold.",
                "You've joined as many shared routines as an account can hold.",
            );
        }
    }
    const [row] = await tx
        .select({ routineId: sql<string | null>`r.id` })
        .from(sql`cadence_join_routine(${hash}) AS r(id)`);
    if (!row?.routineId) throw expired();
    return { kind: "routine", routineId: row.routineId };
}

async function clearTakes(tx: Tx, ownerId: string, listId: string, userIds?: string[]) {
    await tx
        .update(tasks)
        .set({ takenBy: null, takenAt: null })
        .where(
            and(
                eq(tasks.userId, ownerId),
                eq(tasks.projectId, listId),
                userIds ? inArray(tasks.takenBy, userIds) : isNotNull(tasks.takenBy),
            ),
        );
}

export async function setMemberRole(tx: Tx, ownerId: string, listId: string, memberId: string, role: ShareRole) {
    const [row] = await tx
        .update(listMembers)
        .set({ role })
        .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, memberId)))
        .returning({ userId: listMembers.userId, role: listMembers.role, invitedBy: listMembers.invitedBy });
    if (!row) throw new AppError(404, "NOT_FOUND", "Person not found in this list");
    if (role === "view") await clearTakes(tx, ownerId, listId, [memberId]);
    return row;
}

export async function removeMember(tx: Tx, access: ListAccess, memberId: string) {
    if (access.role !== "view") await clearTakes(tx, access.ownerId, access.listId, [memberId]);
    const rows = await tx
        .delete(listMembers)
        .where(and(eq(listMembers.listId, access.listId), eq(listMembers.userId, memberId)))
        .returning({ userId: listMembers.userId });
    if (!rows.length) throw new AppError(404, "NOT_FOUND", "Person not found in this list");
}

/** Stop sharing: everyone is removed, all takes are cleared, and every link dies. */
export async function stopSharing(tx: Tx, userId: string, access: ListAccess) {
    await clearTakes(tx, userId, access.listId);
    await tx.delete(listMembers).where(eq(listMembers.listId, access.listId));
    await resetInvites(tx, userId, { listId: access.listId });
}

export async function removeEventMember(tx: Tx, access: EventAccess, memberId: string) {
    const rows = await tx
        .delete(eventMembers)
        .where(and(eq(eventMembers.eventId, access.eventId), eq(eventMembers.userId, memberId)))
        .returning({ userId: eventMembers.userId });
    if (!rows.length) throw new AppError(404, "NOT_FOUND", "Person not found on this event");
}

/** Stop sharing an event: everyone is removed and every link dies. */
export async function stopSharingEvent(tx: Tx, userId: string, access: EventAccess) {
    await tx.delete(eventMembers).where(eq(eventMembers.eventId, access.eventId));
    await resetInvites(tx, userId, { eventId: access.eventId });
}

export async function removeRoutineMember(tx: Tx, access: RoutineAccess, memberId: string) {
    const rows = await tx
        .delete(routineMembers)
        .where(and(eq(routineMembers.habitId, access.habitId), eq(routineMembers.userId, memberId)))
        .returning({ userId: routineMembers.userId });
    if (!rows.length) throw new AppError(404, "NOT_FOUND", "Person not found on this routine");
}

/** Stop sharing a routine: everyone is removed, links die, and mode/turns reset to null. */
export async function stopSharingRoutine(tx: Tx, userId: string, access: RoutineAccess) {
    await tx.delete(routineMembers).where(eq(routineMembers.habitId, access.habitId));
    await resetInvites(tx, userId, { routineId: access.habitId });
    await tx
        .update(habits)
        .set({ shareMode: null, turnOrder: null, turnsFrom: null })
        .where(and(eq(habits.id, access.habitId), eq(habits.userId, userId)));
}

/** Transfer ownership of a list to a current member via `cadence_transfer_list`. */
export async function transferList(tx: Tx, listId: string, toUserId: string) {
    const [row] = await tx
        .select({ ok: sql<boolean>`r.ok` })
        .from(sql`cadence_transfer_list(${listId}::uuid, ${toUserId}::uuid) AS r(ok)`);
    if (!row?.ok) throw new AppError(404, "NOT_FOUND", "Person not found in this list");
}

const peopleColumns = {
    userId: sql<string>`r.user_id`,
    name: sql<string | null>`r.name`,
    image: sql<string | null>`r.image`,
    pronouns: sql<string | null>`r.pronouns`,
    role: sql<ListPerson["role"]>`r.role`,
};

export {
    assertCanRemoveMember,
    inviteCreated,
    peopleResponse,
    replanAudience,
    resetInvitesResponse,
    stopSharingResponse,
} from "./sharing-route-helpers";

/** The owner and every member, as the people in the list see each other. Never email or birthday. */
export async function listPeople(tx: Tx, listId: string): Promise<ListPerson[]> {
    return tx.select(peopleColumns).from(sql`cadence_list_people(${listId}::uuid) AS r`);
}

/** The owner and every member of a shared event. Never email or birthday. */
export async function eventPeople(tx: Tx, eventId: string): Promise<ListPerson[]> {
    return tx.select(peopleColumns).from(sql`cadence_event_people(${eventId}::uuid) AS r`);
}

/** The owner and every member of a shared routine. Never email or birthday. */
export async function routinePeople(tx: Tx, habitId: string): Promise<ListPerson[]> {
    return tx.select(peopleColumns).from(sql`cadence_routine_people(${habitId}::uuid) AS r`);
}
