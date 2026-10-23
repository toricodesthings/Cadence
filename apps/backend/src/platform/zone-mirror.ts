/**
 * The set of time zones Cadence's users live in, mirrored into KV so the hourly cron can tell, without waking
 * Postgres, whether anyone is at their local 03:00 or 04:00. Rebuilt from Postgres daily (dropping zones no one
 * uses any more); a person's reminder clock adds their zone on each rebuild, so a change lands within seconds.
 * Missing or unreadable means "unknown": the cron then runs as if every hour were due.
 */
import { wallTimeOf, type Zone } from "@cadence/domain/time";
import type { Env } from "../types/env";

const KEY = "cadence:zones";

export async function mirroredZones(env: Env): Promise<Zone[] | null> {
    try {
        return (await env.OAUTH_KV?.get<Zone[]>(KEY, "json")) ?? null;
    } catch {
        return null;
    }
}

export async function writeZoneMirror(env: Env, zones: Iterable<Zone>): Promise<void> {
    await env.OAUTH_KV?.put(KEY, JSON.stringify([...new Set(zones)].sort()));
}

/** Adds one zone if it isn't mirrored yet. ponytail: read-modify-write, so two new zones at once can lose one until the daily rebuild. */
export async function rememberZone(env: Env, zone: Zone): Promise<void> {
    const zones = await mirroredZones(env);
    if (zones && !zones.includes(zone)) await writeZoneMirror(env, [...zones, zone]);
}

/** Whether any mirrored zone's local hour at `now` is `hour`; true when the mirror is unknown. */
export function someZoneAt(zones: Zone[] | null, now: Date, hour: number): boolean {
    return zones === null || zones.some((zone) => Number(wallTimeOf(now, zone).split(":")[0]) === hour);
}
