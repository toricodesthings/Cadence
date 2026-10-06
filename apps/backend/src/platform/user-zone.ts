/**
 * The user's zone, from one place: `users.time_zone`. Every server path (REST, the assistant, MCP,
 * cron, reminders, metrics) reads it here and never from a request or a connection row.
 */
import { eq } from "drizzle-orm";
import { isZone, type Zone } from "@cadence/domain/time";
import { users } from "../db/schema";
import type { Tx } from "../types/db";

/** The zone Settings pins, if it pins one ("device" follows the device; anything unrecognised is not a pin). */
function pinnedZone(settings: { dateTime?: { timezone?: string } } | null): Zone | null {
    const zone = settings?.dateTime?.timezone;
    return isZone(zone) ? zone : null;
}

/** The user's IANA zone. `UTC` only if the stored value is somehow invalid. */
export async function userZone(tx: Tx, userId: string): Promise<Zone> {
    const [row] = await tx.select({ zone: users.timeZone }).from(users).where(eq(users.id, userId));
    return row && isZone(row.zone) ? row.zone : "UTC";
}

/**
 * Keep `users.time_zone` equal to the zone the client reports (its device zone, or the one Settings
 * pins, which wins over a device report). An unrecognised report is ignored. Returns the zone now stored.
 */
export async function syncUserZone(tx: Tx, userId: string, reported: unknown): Promise<Zone> {
    const [row] = await tx.select({ zone: users.timeZone, settings: users.settings }).from(users).where(eq(users.id, userId));
    const current = row && isZone(row.zone) ? row.zone : "UTC";
    const next = (row && pinnedZone(row.settings)) ?? (isZone(reported) ? reported : current);
    if (next !== current) await tx.update(users).set({ timeZone: next }).where(eq(users.id, userId));
    return next;
}
