import { beforeAll, describe, expect, it, vi } from "vitest";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { handleOverdueCheck, pruneAiMemories, pruneStaleMutations, pruneUsageEvents } from "../../src/cron/overdue-check";

const env = {} as any;

beforeAll(startTestDb);

/** Cron connects as the table owner in production (it sweeps every user), so run it that way here. */
const runCron = (job: (env: any) => Promise<unknown>) => asOwner(() => job(env));

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

    it("drops only expired EPHEMERAL memories, never CORE ones", async () => {
        const userId = await createUser();
        await sql(
            `INSERT INTO ai_memories (user_id, content, type, expires_at) VALUES
                ($1, 'expired ephemeral', 'EPHEMERAL', NOW() - interval '1 day'),
                ($1, 'live ephemeral', 'EPHEMERAL', NOW() + interval '1 day'),
                ($1, 'expired core', 'CORE', NOW() - interval '1 day')`,
            [userId],
        );

        await runCron(pruneAiMemories);

        expect((await sql("SELECT content FROM ai_memories WHERE user_id = $1 ORDER BY content", [userId])).map((r) => r.content)).toEqual([
            "expired core",
            "live ephemeral",
        ]);
    });

    it("drops usage events past the 90-day retention and keeps newer ones", async () => {
        const userId = await createUser();
        await sql("INSERT INTO usage_events (user_id, event, created_at) VALUES ($1, 'old', NOW() - interval '91 days'), ($1, 'new', NOW() - interval '89 days')", [userId]);

        await runCron(pruneUsageEvents);

        expect(await sql("SELECT event FROM usage_events WHERE user_id = $1", [userId])).toEqual([{ event: "new" }]);
    });
});
