/**
 * The 0004 time-model migration, rule by rule (see the header of drizzle/0004_time_model_expand.sql):
 * old-shape rows go in at 0003, the migration runs, and every row must come out as the day the app showed.
 */
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const DIR = join(fileURLToPath(import.meta.url), "../../../drizzle");
const run = (pg: PGlite, tag: string) => pg.exec(readFileSync(join(DIR, `${tag}.sql`), "utf8"));

const TORONTO = "00000000-0000-4000-8000-000000000001";
const PINNED = "00000000-0000-4000-8000-000000000002";
const UNKNOWN = "00000000-0000-4000-8000-000000000003";

let pg: PGlite;
const rows: Record<string, string> = {};

async function seed(name: string, cols: { user?: string; allDay: boolean; due?: string | null; start?: string | null; end?: string | null; rule?: string | null; notBefore?: string | null }) {
    const id = crypto.randomUUID();
    rows[name] = id;
    await pg.query(
        `INSERT INTO tasks (id, user_id, title, order_index, is_all_day, due_date, scheduled_start, scheduled_end, recurrence_rule, not_before)
         VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9)`,
        [id, cols.user ?? TORONTO, name, cols.allDay, cols.due ?? null, cols.start ?? null, cols.end ?? null, cols.rule ?? null, cols.notBefore ?? null],
    );
}

const task = async (name: string) =>
    (await pg.query<Record<string, string | null>>(
        `SELECT due_on::text, end_on::text, scheduled_start, scheduled_end, zone, hidden_until::text, recurrence_rule, due_date, is_all_day FROM tasks WHERE id = $1`,
        [rows[name]],
    )).rows[0];

beforeAll(async () => {
    pg = new PGlite({ extensions: { vector } });
    await pg.exec("CREATE ROLE api_worker NOLOGIN;");
    for (const tag of ["0000_baseline", "0001_align_existing", "0002_indexes_and_retention", "0003_data_exports"]) await run(pg, tag);

    // Toronto via an assistant connection; one pinned zone; one nobody knows.
    await pg.query(`INSERT INTO users (id) VALUES ($1), ($2), ($3)`, [TORONTO, PINNED, UNKNOWN]);
    await pg.query(`UPDATE users SET settings = jsonb_set(settings, '{dateTime,timezone}', '"Pacific/Kiritimati"') WHERE id = $1`, [PINNED]);
    await pg.query(
        `INSERT INTO mcp_connections (user_id, client_id, client_name, redirect_uri, scopes, timezone) VALUES ($1, 'c', 'c', 'https://x', '{}', 'America/Toronto')`,
        [TORONTO],
    );

    await seed("A noon anchor", { allDay: true, due: "2026-10-05T12:00:00.000Z" });
    await seed("A end of day anchor", { allDay: true, due: "2026-10-05T23:59:59.999Z" });
    await seed("A midnight anchor", { allDay: true, due: "2026-10-05T00:00:00.000Z" });
    await seed("B legacy instant (the COMP3000 row)", { allDay: true, due: "2026-10-06T03:59:00.000Z" });
    await seed("C multi-day", { allDay: true, due: "2026-10-05T12:00:00.000Z", end: "2026-10-08T23:59:59.999Z" });
    await seed("D all-day with a start", { allDay: true, start: "2026-10-05T12:00:00.000Z" });
    await seed("D all-day with start and a deadline", { allDay: true, due: "2026-10-09T12:00:00.000Z", start: "2026-10-05T12:00:00.000Z" });
    await seed("E timed", { allDay: false, start: "2026-10-05T18:35:00.000Z", end: "2026-10-05T19:55:00.000Z" });
    await seed("E timed with a deadline", { allDay: false, start: "2026-10-05T18:35:00.000Z", due: "2026-10-09T12:00:00.000Z" });
    await seed("F hide until", { allDay: true, due: "2026-10-09T12:00:00.000Z", notBefore: "2026-10-07T04:00:00.000Z" });
    await seed("G timed series", { allDay: false, start: "2026-10-26T18:35:00.000Z", end: "2026-10-26T19:55:00.000Z", rule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261103T035959Z" });
    await seed("G all-day series", { allDay: true, due: "2026-10-05T12:00:00.000Z", rule: "FREQ=DAILY;UNTIL=20261031T235959Z" });
    await seed("G date-only until stays", { allDay: true, due: "2026-10-05T12:00:00.000Z", rule: "FREQ=DAILY;UNTIL=20261031" });
    await seed("pinned zone user, legacy instant", { user: PINNED, allDay: true, due: "2026-10-05T10:30:00.000Z" }); // Oct 5 20:30 in UTC+14... Kiritimati: Oct 6 00:30
    await seed("unknown zone user, legacy instant", { user: UNKNOWN, allDay: true, due: "2026-10-06T03:59:00.000Z" }); // UTC
    await seed("unscheduled", { allDay: true });

    await run(pg, "0004_time_model_expand");
});

describe("0004 time model expand", () => {
    it("users get a zone: pinned setting, else the connected assistant's, else UTC", async () => {
        const { rows: users } = await pg.query<{ id: string; time_zone: string }>(`SELECT id, time_zone FROM users`);
        const zone = Object.fromEntries(users.map((u) => [u.id, u.time_zone]));
        expect(zone[TORONTO]).toBe("America/Toronto");
        expect(zone[PINNED]).toBe("Pacific/Kiritimati");
        expect(zone[UNKNOWN]).toBe("UTC");
    });

    it("A: canonical anchors read their UTC date", async () => {
        for (const name of ["A noon anchor", "A end of day anchor", "A midnight anchor"]) {
            expect(await task(name), name).toMatchObject({ due_on: "2026-10-05", scheduled_start: null, zone: null });
        }
    });

    it("B: a legacy instant is the day the app showed (COMP3000: Oct 5 in Toronto, not Oct 6)", async () => {
        expect((await task("B legacy instant (the COMP3000 row)")).due_on).toBe("2026-10-05");
        expect((await task("pinned zone user, legacy instant")).due_on).toBe("2026-10-06");
        expect((await task("unknown zone user, legacy instant")).due_on).toBe("2026-10-06");
    });

    it("C: a multi-day end becomes end_on and scheduled_end is cleared", async () => {
        expect(await task("C multi-day")).toMatchObject({ due_on: "2026-10-05", end_on: "2026-10-08", scheduled_end: null });
    });

    it("D: an all-day row with a start becomes a day and drops the start", async () => {
        expect(await task("D all-day with a start")).toMatchObject({ due_on: "2026-10-05", scheduled_start: null });
        expect(await task("D all-day with start and a deadline")).toMatchObject({ due_on: "2026-10-09", scheduled_start: null });
    });

    it("E: timed rows keep their instants, gain the zone, and a deadline becomes a day", async () => {
        const timed = await task("E timed");
        expect(new Date(timed.scheduled_start!).toISOString()).toBe("2026-10-05T18:35:00.000Z");
        expect(new Date(timed.scheduled_end!).toISOString()).toBe("2026-10-05T19:55:00.000Z");
        expect(timed).toMatchObject({ zone: "America/Toronto", due_on: null });
        expect(await task("E timed with a deadline")).toMatchObject({ zone: "America/Toronto", due_on: "2026-10-09" });
    });

    it("F: not_before becomes the day in the user's zone", async () => {
        expect((await task("F hide until")).hidden_until).toBe("2026-10-07");
    });

    it("G: UNTIL instants become the series' last local day", async () => {
        expect((await task("G timed series")).recurrence_rule).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261102"); // 03:59Z Nov 3 = 23:59 Nov 2 in Toronto
        expect((await task("G all-day series")).recurrence_rule).toBe("FREQ=DAILY;UNTIL=20261031");
        expect((await task("G date-only until stays")).recurrence_rule).toBe("FREQ=DAILY;UNTIL=20261031");
    });

    it("leaves unscheduled rows unscheduled", async () => {
        expect(await task("unscheduled")).toMatchObject({ due_on: null, end_on: null, scheduled_start: null, zone: null });
    });

    it("keeps the old columns readable: untouched until a write, then in step by trigger", async () => {
        expect((await task("A noon anchor")).due_date).not.toBeNull();
        await pg.query(`UPDATE tasks SET due_on = '2026-12-25', hidden_until = '2026-12-01' WHERE id = $1`, [rows["A noon anchor"]]);
        const after = await task("A noon anchor");
        expect(new Date(after.due_date!).toISOString()).toBe("2026-12-25T12:00:00.000Z");
        expect(after.is_all_day).toBe(true);
        await pg.query(`UPDATE tasks SET scheduled_start = '2026-12-25T15:00:00Z', zone = 'America/Toronto' WHERE id = $1`, [rows["A noon anchor"]]);
        expect((await task("A noon anchor")).is_all_day).toBe(false);
    });

    it("enforces the model: a timed task needs a zone; an end needs a start day; a timed task has no end day", async () => {
        const bad = (sql: string) => pg.query(sql, [rows["unscheduled"]]).then(() => "ok", (e: Error) => e.message);
        expect(await bad(`UPDATE tasks SET scheduled_start = now() WHERE id = $1`)).toContain("tasks_timed_zone_check");
        expect(await bad(`UPDATE tasks SET end_on = '2026-10-01' WHERE id = $1`)).toContain("tasks_end_on_check");
        expect(await bad(`UPDATE tasks SET scheduled_end = now() WHERE id = $1`)).toContain("tasks_end_needs_start_check");
        expect(await bad(`UPDATE tasks SET due_on = '2026-10-05', end_on = '2026-10-04' WHERE id = $1`)).toContain("tasks_end_on_check");
        expect(await bad(`UPDATE tasks SET due_on = '2026-10-05', end_on = '2026-10-06', scheduled_start = now(), zone = 'UTC' WHERE id = $1`)).toContain("tasks_timed_end_on_check");
    });
});
