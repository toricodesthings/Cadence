import { customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * `timestamp with time zone`, read as a strict ISO-8601 string ("2026-03-09T12:00:00.000Z").
 * Drivers hand back Postgres text ("2026-03-09 12:00:00+00"); normalizing here, where every
 * read passes, keeps API timestamps in one format and lets clients echo them back as-is.
 */
export const timestamptz = customType<{ data: string; driverData: string | Date }>({
    dataType: () => "timestamp with time zone",
    fromDriver: (value) => new Date(value).toISOString(),
});

/**
 * The JWT user's id. Wrapped in a sub-select so Postgres reads and parses the claim
 * once per query (an InitPlan), not once per row.
 */
export const rlsUserId = sql`(select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)`;

/** RLS condition: row belongs to the JWT-authenticated user */
export const rlsUsing = sql`(user_id = ${rlsUserId})`;
