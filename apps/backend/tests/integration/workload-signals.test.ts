import { beforeAll, expect, it } from "vitest";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";
import { computeWorkloadSignals } from "../../src/platform/metrics";

beforeAll(startTestDb);

it("windows reschedules by when they happened, not by when the metric row was made", async () => {
    const userId = await createUser();
    const day = 86_400_000;
    await asOwner(async (pg) => {
        for (const [title, count, ago] of [["old", 9, 30], ["recent", 2, 2]] as const) {
            const { rows } = await pg.query<{ id: string }>(
                "insert into tasks (user_id, title, order_index) values ($1, $2, 0) returning id", [userId, title]);
            // A fresh row (created now) that was last rescheduled `ago` days back.
            await pg.query(
                "insert into task_metrics (task_id, user_id, reschedule_count, last_rescheduled_at) values ($1, $2, $3, $4)",
                [rows[0].id, userId, count, new Date(Date.now() - ago * day).toISOString()]);
        }
    });
    await computeWorkloadSignals(getTestDb(), userId);
    const velocity = await asOwner(async (pg) =>
        (await pg.query<{ reschedule_velocity: number }>("select reschedule_velocity from user_metrics where user_id = $1", [userId])).rows[0]);
    expect(Number(velocity.reschedule_velocity)).toBe(2);
});
