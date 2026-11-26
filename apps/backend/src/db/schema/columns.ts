import { customType, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const timestamptz = customType<{ data: string; driverData: string | Date }>({
    dataType: () => "timestamp with time zone",
    fromDriver: (value) => new Date(value).toISOString(),
});

export const rlsUserId = sql`(select ((current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::uuid)`;

export const rlsUsing = sql`(user_id = ${rlsUserId})`;

export const id = () =>
    uuid("id")
        .default(sql`uuidv7()`)
        .primaryKey();

export const createdAt = () =>
    timestamptz("created_at")
        .default(sql`now()`)
        .notNull();

export const memberView = sql`(select cadence_member_lists('view'::share_role))`;
export const memberEdit = sql`(select cadence_member_lists('edit'::share_role))`;

export const memberEventView = sql`(select cadence_member_events('view'::share_role))`;
export const memberEventEdit = sql`(select cadence_member_events('edit'::share_role))`;

export const memberRoutineView = sql`(select cadence_member_routines('view'::share_role))`;
export const memberRoutineEdit = sql`(select cadence_member_routines('edit'::share_role))`;
