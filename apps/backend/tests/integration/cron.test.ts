import { beforeAll, describe, expect, it, vi } from "vitest";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";

const getDbClient = vi.hoisted(() => vi.fn());
vi.mock("../../src/platform/db", async () => {
    const { getTestDb } = await import("../helpers/db");
    getDbClient.mockImplementation(getTestDb);
    return { getDbClient };
});

import { computeWorkloadSignals, signalsStale } from "../../src/platform/metrics";
import { pruneStaleMutations, pruneUsageEvents, runHourlyCron, runMemoryNightly } from "../../src/cron/overdue-check";

const env = {} as any;

beforeAll(startTestDb);

/** Cron connects as api_worker, under RLS, like every other Worker path (the test DB's default role). */
const runCron = (job: (env: any) => Promise<unknown>) => job(env);

async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
    return asOwner(async (pg) => (await pg.query<T>(text, params)).rows);
}

async function task(userId: string, title: string, dueOn: string | null, extra: { state?: string; rule?: string; mode?: string; start?: string } = {}) {
    const [row] = await sql<{ id: string }>(
        `INSERT INTO tasks (user_id, title, order_index, due_on, state, recurrence_rule, interaction_mode, scheduled_start, zone)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7, CASE WHEN $7::timestamptz IS NULL THEN NULL ELSE 'UTC' END) RETURNING id`,
        [userId, title, dueOn, extra.state ?? "ACTIVE", extra.rule ?? null, extra.mode ?? "task", extra.start ?? null],
    );
    return row.id;
}

const setZone = (userId: string, zone: string) => sql("UPDATE users SET time_zone = $2 WHERE id = $1", [userId, zone]);
const overdueLoad = async (userId: string) => {
    await computeWorkloadSignals(getTestDb() as never, userId);
    return (await sql("SELECT overdue_carry_load FROM user_metrics WHERE user_id = $1", [userId]))[0]?.overdue_carry_load;
};

// Overdue is judged on read now (workload signals), by the same rule the old 04:00 pass used.
describe("workload signals' overdue load", () => {
    it("counts only open, one-off, non-Fixed tasks whose day is before the user's today", async () => {
        const userId = await createUser();
        await setZone(userId, "UTC");
        await task(userId, "late", "2000-01-01");
        await task(userId, "done", "2000-01-01", { state: "COMPLETE" });
        await task(userId, "future", "2999-01-01");
        await task(userId, "rent", "2000-01-01", { rule: "FREQ=MONTHLY" });
        await task(userId, "class", "2000-01-01", { mode: "timetable" });
        expect(await overdueLoad(userId)).toBe(1);
    });

    it("judges by the user's today in their zone, and a timed task by its start", async () => {
        const userId = await createUser();
        await setZone(userId, "Pacific/Kiritimati");
        const today = new Date(Date.now() + 14 * 3600_000).toISOString().slice(0, 10); // ponytail: test-only day of a +14 zone
        await task(userId, "today", today);
        await task(userId, "timed past", null, { start: new Date(Date.now() - 3 * 24 * 3600_000).toISOString() });
        expect(await overdueLoad(userId)).toBe(1);
    });

    it("is recomputed when missing or older than a day, not when fresh", () => {
        const now = Date.parse("2026-10-05T12:00:00Z");
        expect(signalsStale(undefined, now)).toBe(true);
        expect(signalsStale("2026-10-04T11:59:00Z", now)).toBe(true);
        expect(signalsStale("2026-10-05 08:30:00+00", now)).toBe(false);
        expect(signalsStale("garbage", now)).toBe(true);
    });
});

describe("pruning", () => {
    it("drops idempotency keys older than 7 days and keeps recent ones", async () => {
        const userId = await createUser();
        await sql("INSERT INTO mutation_dedup (user_id, client_mutation_id, created_at) VALUES ($1, 'old', NOW() - interval '8 days'), ($1, 'new', NOW())", [userId]);

        await runCron(pruneStaleMutations);

        expect(await sql("SELECT client_mutation_id FROM mutation_dedup WHERE user_id = $1", [userId])).toEqual([{ client_mutation_id: "new" }]);
    });

    it("drops memory facts past their validThrough (a day's grace) in the nightly pass, keeping open-ended and current ones", async () => {
        const userId = await createUser({ zone: "UTC" });
        const insert = (content: string, validThrough: string | null) =>
            sql(
                `INSERT INTO ai_memories (user_id, kind, content, said_on, last_seen_on, source, confidence, valid_through)
                 VALUES ($1, 'life', $2, '2026-01-01', '2026-01-01', 'chat', 'stated', $3)`,
                [userId, content, validThrough],
            );
        await insert("ended long ago", "2026-09-01");
        await insert("ended yesterday", "2026-10-04");
        await insert("ends today", "2026-10-05");
        await insert("no end", null);

        await runMemoryNightly({} as any, new Date("2026-10-05T06:30:00Z"));

        expect((await sql("SELECT content FROM ai_memories WHERE user_id = $1 ORDER BY content", [userId])).map((r) => r.content)).toEqual([
            "ended yesterday", // the day after it ended is still inside the grace
            "ends today",
            "no end",
        ]);
    });

    it("drops usage events past the 90-day retention and keeps newer ones", async () => {
        const userId = await createUser();
        await sql("INSERT INTO usage_events (user_id, event, created_at) VALUES ($1, 'old', NOW() - interval '91 days'), ($1, 'new', NOW() - interval '89 days')", [userId]);

        await runCron(pruneUsageEvents);

        expect(await sql("SELECT event FROM usage_events WHERE user_id = $1", [userId])).toEqual([{ event: "new" }]);
    });
});

describe("the daily run", () => {
    const at = (hour: number) => new Date(Date.UTC(2026, 9, 5, hour, 30));

    it("does nothing at any hour but 06:00 UTC (no database call)", async () => {
        getDbClient.mockClear();
        for (const hour of [0, 3, 4, 5, 7, 13, 23]) await runHourlyCron({} as any, at(hour));
        expect(getDbClient).not.toHaveBeenCalled();
    });

    it("at 06:00 UTC prunes and sends memory's nightly for every person, in any zone", async () => {
        const [toronto, tokyo] = [await createUser({ zone: "America/Toronto" }), await createUser({ zone: "Asia/Tokyo" })];
        await sql("INSERT INTO mutation_dedup (user_id, client_mutation_id, created_at) VALUES ($1, 'old', '2026-09-01')", [toronto]);
        const sent: Array<{ userId: string }> = [];
        const env = { MEMORY_QUEUE: { sendBatch: async (batch: Array<{ body: { userId: string } }>) => { sent.push(...batch.map((m) => m.body)); } } } as any;
        await runHourlyCron(env, at(6));
        expect(await sql("SELECT 1 FROM mutation_dedup WHERE user_id = $1", [toronto])).toEqual([]);
        expect(sent.map((m) => m.userId)).toEqual(expect.arrayContaining([toronto, tokyo]));
    });
});
