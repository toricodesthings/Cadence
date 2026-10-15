import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { asOwner, createUser, startTestDb } from "../helpers/db";

beforeAll(startTestDb);

// The data steps of 0022: reports already given get their task back, and the day's budget carries over.
const dataSteps = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../drizzle/0022_duration_reports.sql"), "utf8")
    .split("--> statement-breakpoint")
    .filter((s) => /^\s*(--.*\n)*\s*(WITH|UPDATE)/.test(s));

describe("0022 backfill", () => {
    it("matches a report to the one task completed seconds before it, and seeds the budget", async () => {
        const userId = await createUser();
        await asOwner(async (pg) => {
            await pg.query("UPDATE users SET settings = jsonb_build_object('assistant', jsonb_build_object('memoryMode', 'full')) WHERE id = $1", [userId]);
            const [{ id: lab }] = (await pg.query<any>("INSERT INTO tasks (user_id, title, order_index) VALUES ($1, 'Lab PHYS1905', 1) RETURNING id", [userId])).rows;
            const [{ id: other }] = (await pg.query<any>("INSERT INTO tasks (user_id, title, order_index) VALUES ($1, 'Lab PHYS1905', 2) RETURNING id", [userId])).rows;
            const [{ id: far }] = (await pg.query<any>("INSERT INTO tasks (user_id, title, order_index) VALUES ($1, 'Stat exam', 3) RETURNING id", [userId])).rows;
            await pg.query("INSERT INTO task_metrics (task_id, user_id, completed_at) VALUES ($1, $3, '2026-10-13 20:00:00+00'), ($2, $3, '2026-10-13 20:00:03+00')", [lab, other, userId]);
            await pg.query("INSERT INTO task_metrics (task_id, user_id, completed_at) VALUES ($1, $2, '2026-10-13 10:00:00+00')", [far, userId]);
            // Two candidates within 60 s: ambiguous, so it stays null. 'stat exam' completed hours before: null too.
            await pg.query(`INSERT INTO ai_memory_signals (user_id, kind, "on", bucket, subject, minutes, created_at) VALUES
                ($1, 'duration', '2026-10-13', 'report', 'lab phys1905', 60, '2026-10-13 20:00:06+00'),
                ($1, 'duration', '2026-10-14', 'report', 'stat exam', 120, '2026-10-14 00:02:00+00')`, [userId]);
            for (const step of dataSteps) await pg.query(step);
            const rows = (await pg.query<any>("SELECT subject, task_id FROM ai_memory_signals WHERE user_id = $1 ORDER BY subject", [userId])).rows;
            expect(rows).toEqual([
                { subject: "lab phys1905", task_id: null },
                { subject: "stat exam", task_id: null },
            ]);
            // Now one candidate only.
            await pg.query("DELETE FROM task_metrics WHERE task_id = $1", [other]);
            for (const step of dataSteps) await pg.query(step);
            const [lab1] = (await pg.query<any>("SELECT task_id FROM ai_memory_signals WHERE user_id = $1 AND subject = 'lab phys1905'", [userId])).rows;
            expect(lab1.task_id).toBe(lab);
            const [{ ask }] = (await pg.query<any>("SELECT settings #> '{assistant,durationAsk}' AS ask FROM users WHERE id = $1", [userId])).rows;
            expect(ask).toEqual({ lastOn: "2026-10-14", misses: 0 });
        });
    });
});
