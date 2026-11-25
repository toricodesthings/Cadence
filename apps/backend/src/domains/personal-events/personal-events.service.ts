import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { InsertPersonalEvent, SharedEvent, UpdatePersonalEvent } from "@cadence/contracts/personal-event";
import type { ListMember } from "@cadence/contracts/sharing";
import { eventMembers, personalEvents } from "../../db/schema";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { createOnce } from "../../platform/idempotency";
import { assertRowRoom } from "../../platform/storage-ceiling";
import type { Tx } from "../../types/db";

/** The contract's fields only: no owner, no timestamps. */
const eventColumns = {
    id: personalEvents.id,
    label: personalEvents.label,
    monthDay: personalEvents.monthDay,
    emoji: personalEvents.emoji,
    notify: personalEvents.notify,
    startedOn: personalEvents.startedOn,
    color: personalEvents.color,
};

const owned = (userId: string, id: string) => and(eq(personalEvents.id, id), eq(personalEvents.userId, userId));

/** Create an event. A replayed idempotency key returns the first one. */
export async function createEvent(tx: Tx, userId: string, body: InsertPersonalEvent, idempotencyKey?: string) {
    return createOnce(
        tx,
        userId,
        idempotencyKey,
        (id) => tx.select(eventColumns).from(personalEvents).where(owned(userId, id)),
        async () => {
            await assertRowRoom(tx, userId, "events");
            return tx
                .insert(personalEvents)
                .values({ ...body, userId })
                .returning(eventColumns);
        },
    );
}

export async function updateEvent(tx: Tx, userId: string, id: string, patch: UpdatePersonalEvent) {
    const [row] = await tx
        .update(personalEvents)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(owned(userId, id))
        .returning(eventColumns);
    throwIfNotFound(row, "Event");
    return row;
}

/** Update the caller's own reminder preference on a shared event via `cadence_set_event_notify`. */
export async function setEventNotify(tx: Tx, eventId: string, notify: boolean): Promise<void> {
    const [row] = await tx
        .select({ ok: sql<boolean>`r.ok` })
        .from(sql`cadence_set_event_notify(${eventId}::uuid, ${notify}) AS r(ok)`);
    if (!row?.ok) throw new AppError(404, "NOT_FOUND", "Event not found");
}

/** Read one event with caller's resolved `notify` (owner or member). */
export async function getEventForCaller(tx: Tx, userId: string, id: string) {
    const [row] = await tx
        .select({
            ...eventColumns,
            notify: sql<boolean>`coalesce(${eventMembers.notify}, ${personalEvents.notify})`,
        })
        .from(personalEvents)
        .leftJoin(eventMembers, and(eq(eventMembers.eventId, personalEvents.id), eq(eventMembers.userId, userId)))
        .where(and(eq(personalEvents.id, id), or(eq(personalEvents.userId, userId), eq(eventMembers.userId, userId))));
    throwIfNotFound(row, "Event");
    return row;
}

/** In the order they were added, including events shared with the caller. */
export async function listEvents(tx: Tx, userId: string): Promise<SharedEvent[]> {
    const rows = await tx
        .select({
            ...eventColumns,
            notify: sql<boolean>`coalesce(${eventMembers.notify}, ${personalEvents.notify})`,
            ownerId: personalEvents.userId,
            memberRole: eventMembers.role,
        })
        .from(personalEvents)
        .leftJoin(eventMembers, and(eq(eventMembers.eventId, personalEvents.id), eq(eventMembers.userId, userId)))
        .where(or(eq(personalEvents.userId, userId), eq(eventMembers.userId, userId)))
        .orderBy(asc(personalEvents.createdAt), asc(personalEvents.id));

    if (!rows.length) return [];

    const ids = rows.map((row) => row.id);
    const allMembers = await tx
        .select({
            eventId: eventMembers.eventId,
            userId: eventMembers.userId,
            role: eventMembers.role,
            invitedBy: eventMembers.invitedBy,
        })
        .from(eventMembers)
        .where(inArray(eventMembers.eventId, ids));

    const membersByEvent = new Map<string, ListMember[]>();
    for (const m of allMembers) {
        const list = membersByEvent.get(m.eventId) ?? [];
        list.push({ userId: m.userId, role: m.role, invitedBy: m.invitedBy });
        membersByEvent.set(m.eventId, list);
    }

    return rows.map(({ ownerId, memberRole, ...event }) => ({
        ...event,
        access: ownerId === userId ? "owner" : (memberRole ?? "edit"),
        members: membersByEvent.get(event.id) ?? [],
    }));
}

export async function deleteEvent(tx: Tx, userId: string, id: string) {
    const [row] = await tx.delete(personalEvents).where(owned(userId, id)).returning(eventColumns);
    throwIfNotFound(row, "Event");
    return row;
}
