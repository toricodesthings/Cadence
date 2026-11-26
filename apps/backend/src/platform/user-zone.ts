import { eq } from "drizzle-orm";
import { isZone, type Zone } from "@cadence/domain/time";
import { users } from "../db/schema";
import type { Tx } from "../types/db";

const storedZone = (zone: unknown): Zone => (isZone(zone) ? zone : "UTC");

export async function userZone(tx: Tx, userId: string): Promise<Zone> {
    const [row] = await tx.select({ zone: users.timeZone }).from(users).where(eq(users.id, userId));
    if (row) return storedZone(row.zone);
    const [own] = await tx.select({ zone: users.timeZone }).from(users).limit(1);
    return storedZone(own?.zone);
}

export async function syncUserZone(tx: Tx, userId: string, reported: unknown): Promise<Zone> {
    return (await syncUserZoneWithSettings(tx, userId, reported)).timezone;
}

export async function syncUserZoneWithSettings(tx: Tx, userId: string, reported: unknown) {
    const [row] = await tx
        .select({ zone: users.timeZone, settings: users.settings })
        .from(users)
        .where(eq(users.id, userId));
    const current = storedZone(row?.zone);
    const pinned = row?.settings?.dateTime?.timezone;
    const next = isZone(pinned) ? pinned : isZone(reported) ? reported : current;
    if (next !== current) await tx.update(users).set({ timeZone: next }).where(eq(users.id, userId));
    return { timezone: next, settings: row?.settings ?? {} };
}
