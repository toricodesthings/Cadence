import { and, asc, eq, sql } from "drizzle-orm";
import type { InsertPersonalEvent, UpdatePersonalEvent } from "@cadence/contracts/personal-event";
import { personalEvents } from "../../db/schema";
import { throwIfNotFound } from "../../platform/errors";
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

/** In the order they were added. */
export function listEvents(tx: Tx, userId: string) {
    return tx
        .select(eventColumns)
        .from(personalEvents)
        .where(eq(personalEvents.userId, userId))
        .orderBy(asc(personalEvents.createdAt), asc(personalEvents.id));
}

export async function deleteEvent(tx: Tx, userId: string, id: string) {
    const [row] = await tx.delete(personalEvents).where(owned(userId, id)).returning(eventColumns);
    throwIfNotFound(row, "Event");
    return row;
}
