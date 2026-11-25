import { customType, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

/** Primary key. UUIDv7 is time-ordered, so inserts append to the index instead of splitting random pages. */
export const id = () =>
    uuid("id")
        .default(sql`uuidv7()`)
        .primaryKey();

/** When the row was made. */
export const createdAt = () =>
    timestamptz("created_at")
        .default(sql`now()`)
        .notNull();

/** List ids the caller belongs to at `view` or above (SECURITY DEFINER, so policies on `projects` don't recurse). */
export const memberView = sql`(select cadence_member_lists('view'::share_role))`;
/** List ids the caller can edit. */
export const memberEdit = sql`(select cadence_member_lists('edit'::share_role))`;

/** Event ids the caller belongs to at `view` or above (SECURITY DEFINER, so policies on `personal_events` don't recurse). */
export const memberEventView = sql`(select cadence_member_events('view'::share_role))`;
/** Event ids the caller can edit. */
export const memberEventEdit = sql`(select cadence_member_events('edit'::share_role))`;

/** Routine ids the caller belongs to at `view` or above (SECURITY DEFINER, so policies on `habits` don't recurse). */
export const memberRoutineView = sql`(select cadence_member_routines('view'::share_role))`;
/** Routine ids the caller participates in (`edit`). */
export const memberRoutineEdit = sql`(select cadence_member_routines('edit'::share_role))`;
