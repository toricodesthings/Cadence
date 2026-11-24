import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { asOwner, createUser, startTestDb } from "../helpers/db";

beforeAll(startTestDb);

const steps = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../drizzle/0033_personal_events_data.sql"),
    "utf8",
).split("--> statement-breakpoint");

describe("0033 personal events data", () => {
    it("moves settings items into rows, keeps their order, and rewrites push keys", async () => {
        const a = await createUser();
        const b = await createUser();
        await asOwner(async (pg) => {
            const items = [
                {
                    id: "aaaaaaaaaaaa",
                    label: "Mom",
                    monthDay: "03-14",
                    emoji: "🎂",
                    notify: true,
                    startedOn: "1960-03-14",
                    color: "rose",
                },
                { id: "bbbbbbbbbbbb", label: "Gym day", monthDay: "05-01", emoji: "", startedOn: null },
                {
                    id: "cccccccccccc",
                    label: "Move-in",
                    monthDay: "06-30",
                    emoji: null,
                    notify: false,
                    startedOn: null,
                },
            ];
            await pg.query("UPDATE users SET settings = $2::jsonb WHERE id = $1", [
                a,
                JSON.stringify({ calendar: { personalEvents: { enabled: false, items } } }),
            ]);
            await pg.query("UPDATE users SET settings = '{}'::jsonb WHERE id = $1", [b]);
            const [{ id: deviceId }] = (
                await pg.query<any>(
                    "INSERT INTO devices (user_id, install_id, kind, label) VALUES ($1, 'i1', 'web', 'Laptop') RETURNING id",
                    [a],
                )
            ).rows;
            await pg.query(
                `INSERT INTO push_deliveries (user_id, device_id, occurrence_key, lease_until)
                 VALUES ($1, $2, 'personal-event::aaaaaaaaaaaa::2026-12-01', now())`,
                [a, deviceId],
            );

            for (const step of steps) await pg.query(step);

            const rows = (
                await pg.query<any>(
                    "SELECT id, label, month_day, emoji, notify, started_on::text, color FROM personal_events WHERE user_id = $1 ORDER BY created_at, id",
                    [a],
                )
            ).rows;
            expect(rows.map((r) => [r.label, r.month_day, r.emoji, r.notify, r.started_on, r.color])).toEqual([
                ["Mom", "03-14", "🎂", true, "1960-03-14", "rose"],
                ["Gym day", "05-01", null, true, null, null],
                ["Move-in", "06-30", null, false, null, null],
            ]);

            const settings = (await pg.query<any>("SELECT settings FROM users WHERE id = $1", [a])).rows[0].settings;
            expect(settings.calendar.personalEvents).toEqual({ enabled: false });

            const key = (await pg.query<any>("SELECT occurrence_key FROM push_deliveries WHERE user_id = $1", [a]))
                .rows[0].occurrence_key;
            expect(key).toBe(`personal-event::${rows[0].id}::2026-12-01`);

            expect((await pg.query<any>("SELECT settings FROM users WHERE id = $1", [b])).rows[0].settings).toEqual({});
            expect(
                (await pg.query<any>("SELECT count(*)::int AS n FROM personal_events WHERE user_id = $1", [b])).rows[0]
                    .n,
            ).toBe(0);
            expect(
                (await pg.query<any>("SELECT to_regclass('pg_temp.personal_event_moves') AS t")).rows[0].t,
            ).toBeNull();
        });
    });
});
