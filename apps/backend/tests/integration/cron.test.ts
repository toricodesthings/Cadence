import { beforeAll, describe, expect, it, vi } from "vitest";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { handleOverdueCheck, pruneStaleMutations, pruneUsageEvents, runHourlyCron, runMemoryNightly } from "../../src/cron/overdue-check";

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
const delayCount = async (taskId: string) => (await sql("SELECT delay_count FROM task_metrics WHERE task_id = $1", [taskId]))[0]?.delay_count;

// 2026-10-05 08:30Z: 04:30 in Toronto (EDT), 15:30 in Kiritimati (+14), 17:30 in Tokyo.
const TORONTO_0430 = new Date("2026-10-05T08:30:00Z");

describe("overdue check", () => {
    it("adds a delay to each swept user's overdue active tasks, refreshes their workload signals, and counts once per run", async () => {
        const [alice, bob] = [await createUser(), await createUser()];
        await setZone(alice, "America/Toronto");
        await setZone(bob, "America/Toronto");
        const late = await task(alice, "late", "2026-10-01");
        const bobLate = await task(bob, "bob late", "2026-10-02");
        const done = await task(alice, "done", "2026-10-01", { state: "COMPLETE" });
        const future = await task(alice, "future", "2999-01-01");

        await runCron((e) => handleOverdueCheck(e, TORONTO_0430));
        // Another run in the same local hour must not be the way a day is counted twice: the hourly cron fires once per hour.
        await runCron((e) => handleOverdueCheck(e, new Date("2026-10-06T08:30:00Z")));

        expect([await delayCount(late), await delayCount(bobLate)]).toEqual([2, 2]);
        expect([await delayCount(done), await delayCount(future)]).toEqual([undefined, undefined]);
        expect(await sql("SELECT user_id FROM user_metrics WHERE user_id = ANY($1) ORDER BY user_id", [[alice, bob].sort()])).toEqual(
            [alice, bob].sort().map((user_id) => ({ user_id })),
        );
    });

    it("sweeps only users whose local hour is 04, so each user is counted once a day", async () => {
        const [toronto, kiritimati] = [await createUser(), await createUser()];
        await setZone(toronto, "America/Toronto");
        await setZone(kiritimati, "Pacific/Kiritimati");
        const a = await task(toronto, "t", "2026-10-01");
        const b = await task(kiritimati, "k", "2026-10-01");

        await runCron((e) => handleOverdueCheck(e, TORONTO_0430)); // 15:30 in Kiritimati
        expect([await delayCount(a), await delayCount(b)]).toEqual([1, undefined]);

        await runCron((e) => handleOverdueCheck(e, new Date("2026-10-04T14:30:00Z"))); // 04:30 on Oct 5 in Kiritimati
        expect([await delayCount(a), await delayCount(b)]).toEqual([1, 1]);
    });

    it("never counts a repeating series or a Fixed (timetable) block as overdue", async () => {
        const userId = await createUser();
        await setZone(userId, "America/Toronto");
        const series = await task(userId, "rent", "2026-09-01", { rule: "FREQ=MONTHLY" });
        const fixed = await task(userId, "class", "2026-09-01", { mode: "timetable" });
        const plain = await task(userId, "plain", "2026-09-01");

        await runCron((e) => handleOverdueCheck(e, TORONTO_0430));

        expect([await delayCount(series), await delayCount(fixed), await delayCount(plain)]).toEqual([undefined, undefined, 1]);
    });

    it("judges overdue by the user's today: due today is not late, yesterday is, in any zone", async () => {
        const [toronto, tokyo] = [await createUser(), await createUser()];
        await setZone(toronto, "America/Toronto");
        await setZone(tokyo, "Asia/Tokyo");
        // 2026-10-05 04:30 Toronto is 17:30 Tokyo; run the Tokyo sweep at its own 04:30 (2026-10-04T19:30Z, its day 10-05).
        const tDueToday = await task(toronto, "today", "2026-10-05");
        const tYesterday = await task(toronto, "yesterday", "2026-10-04");
        const kDueToday = await task(tokyo, "today", "2026-10-05");
        const kYesterday = await task(tokyo, "yesterday", "2026-10-04");

        await runCron((e) => handleOverdueCheck(e, TORONTO_0430));
        await runCron((e) => handleOverdueCheck(e, new Date("2026-10-04T19:30:00Z")));

        expect([await delayCount(tDueToday), await delayCount(tYesterday)]).toEqual([undefined, 1]);
        expect([await delayCount(kDueToday), await delayCount(kYesterday)]).toEqual([undefined, 1]);
    });

    it("judges a timed task by its start against the start of the user's today", async () => {
        const userId = await createUser();
        await setZone(userId, "America/Toronto");
        // Toronto's today starts 2026-10-05T04:00Z: 03:59Z is last night, 04:00Z is today.
        const lastNight = await task(userId, "late", null, { start: "2026-10-05T03:59:00Z" });
        const today = await task(userId, "today", null, { start: "2026-10-05T04:00:00Z" });

        await runCron((e) => handleOverdueCheck(e, TORONTO_0430));

        expect([await delayCount(lastNight), await delayCount(today)]).toEqual([1, undefined]);
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

        // 03:30 local (UTC user): the person's nightly hour.
        await runMemoryNightly({} as any, new Date("2026-10-05T03:30:00Z"));

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

describe("the gated hourly run", () => {
    /** A KV holding the zone mirror (or nothing), recording what the cron writes back. */
    const kvEnv = (zones: string[] | null) => {
        const store = new Map<string, string>(zones ? [["cadence:zones", JSON.stringify(zones)]] : []);
        return { store, env: { OAUTH_KV: { get: async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null), put: async (key: string, value: string) => { store.set(key, value); } } } as any };
    };

    it("touches nothing when no mirrored zone is at 03:00 or 04:00 and it isn't the 06:00 UTC run", async () => {
        const userId = await createUser();
        await setZone(userId, "America/Toronto");
        const late = await task(userId, "late", "2026-10-01");
        const { env } = kvEnv(["Asia/Tokyo"]); // 17:30 there: nothing due
        await runHourlyCron(env, TORONTO_0430);
        expect(await delayCount(late)).toBeUndefined();
    });

    it("runs a zone's 04:00 work when the mirror has it", async () => {
        const userId = await createUser();
        await setZone(userId, "America/Toronto");
        const late = await task(userId, "late", "2026-10-01");
        await runHourlyCron(kvEnv(["America/Toronto"]).env, TORONTO_0430);
        expect(await delayCount(late)).toBe(1);
    });

    it("with no mirror, runs as if every hour were due and rebuilds the mirror", async () => {
        const userId = await createUser();
        await setZone(userId, "America/Toronto");
        const late = await task(userId, "late", "2026-10-01");
        const { env, store } = kvEnv(null);
        await runHourlyCron(env, TORONTO_0430);
        expect(await delayCount(late)).toBe(1);
        expect(JSON.parse(store.get("cadence:zones")!)).toContain("America/Toronto");
    });
});
