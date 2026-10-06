/**
 * The user's zone, from one place: `users.time_zone`. Every server path (REST, the assistant, MCP,
 * cron, reminders, metrics) reads it here and never from a request or a connection row.
 */
import { eq } from "drizzle-orm";
import { isZone, type Zone } from "@cadence/domain/time";
import { users } from "../db/schema";
import type { Tx } from "../types/db";

const storedZone = (zone: unknown): Zone => (isZone(zone) ? zone : "UTC");

/** The user's IANA zone. `UTC` only if the stored value is somehow invalid. */
export async function userZone(tx: Tx, userId: string): Promise<Zone> {
    const [row] = await tx.select({ zone: users.timeZone }).from(users).where(eq(users.id, userId));
    return storedZone(row?.zone);
}

/**
 * Keep `users.time_zone` equal to the zone the client reports (its device zone, or the one Settings
 * pins, which wins over a device report). An unrecognised report is ignored. Returns the zone now stored.
 */
export async function syncUserZone(tx: Tx, userId: string, reported: unknown): Promise<Zone> {
    const [row] = await tx.select({ zone: users.timeZone, settings: users.settings }).from(users).where(eq(users.id, userId));
    const current = storedZone(row?.zone);
    // "device" follows the device; anything unrecognised is not a pin.
    const pinned = row?.settings?.dateTime?.timezone;
    const next = isZone(pinned) ? pinned : isZone(reported) ? reported : current;
    if (next !== current) await tx.update(users).set({ timeZone: next }).where(eq(users.id, userId));
    return next;
}
