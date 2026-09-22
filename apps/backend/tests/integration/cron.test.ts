import { beforeAll, describe, expect, it, vi } from "vitest";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { handleOverdueCheck, pruneAiMemories, pruneStaleMutations } from "../../src/cron/overdue-check";

const env = {} as any;

beforeAll(startTestDb);

/** Cron connects as the table owner in production (it sweeps every user), so run it that way here. */
const runCron = (job: (env: any) => Promise<void>) => asOwner(() => job(env));

async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
    return asOwner(async (pg) => (await pg.query<T>(text, params)).rows);
}

async function task(userId: string, title: string, dueDate: string, state = "ACTIVE") {
    const [row] = await sql<{ id: string }>(
        "INSERT INTO tasks (user_id, title, order_index, due_date, state) VALUES ($1, $2, 1, $3, $4) RETURNING id",
        [userId, title, dueDate, state],
    );
    return row.id;
}

const delayCount = async (taskId: string) => (await sql("SELECT delay_count FROM task_metrics WHERE task_id = $1", [taskId]))[0]?.delay_count;

describe("overdue check", () => {
    it("adds a delay to every user's overdue active tasks, once per run, and refreshes their workload signals", async () => {
        const [alice, bob] = [await createUser(), await createUser()];
        const late = await task(alice, "late", "2026-01-01T12:00:00Z");
        const bobLate = await task(bob, "bob late", "2026-01-02T12:00:00Z");
        const done = await task(alice, "done", "2026-01-01T12:00:00Z", "COMPLETE");
        const future = await task(alice, "future", "2999-01-01T12:00:00Z");

        await runCron(handleOverdueCheck);
        await runCron(handleOverdueCheck);

        expect([await delayCount(late), await delayCount(bobLate)]).toEqual([2, 2]);
        expect([await delayCount(done), await delayCount(future)]).toEqual([undefined, undefined]);
        expect(await sql("SELECT user_id FROM user_metrics WHERE user_id = ANY($1) ORDER BY user_id", [[alice, bob].sort()])).toEqual(
            [alice, bob].sort().map((user_id) => ({ user_id })),
        );
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
});
