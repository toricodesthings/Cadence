import { beforeAll, expect, it } from "vitest";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";
import { computeWorkloadSignals } from "../../src/platform/metrics";

beforeAll(startTestDb);

it("windows reschedules by when they happened, not by when the metric row was made", async () => {
    const userId = await createUser();
    const day = 86_400_000;
    await asOwner(async (pg) => {
        for (const [title, count, ago] of [
            ["old", 9, 30],
            ["recent", 2, 2],
        ] as const) {
            const { rows } = await pg.query<{ id: string }>(
                "insert into tasks (user_id, title, order_index) values ($1, $2, 0) returning id",
                [userId, title],
            );
            // A fresh row (created now) that was last rescheduled `ago` days back.
            await pg.query(
                "insert into task_metrics (task_id, user_id, reschedule_count, last_rescheduled_at) values ($1, $2, $3, $4)",
                [rows[0].id, userId, count, new Date(Date.now() - ago * day).toISOString()],
            );
        }
    });
    await computeWorkloadSignals(getTestDb(), userId);
    const velocity = await asOwner(
        async (pg) =>
            (
                await pg.query<{ reschedule_velocity: number }>(
                    "select reschedule_velocity from user_metrics where user_id = $1",
                    [userId],
                )
            ).rows[0],
    );
    expect(Number(velocity.reschedule_velocity)).toBe(2);
});

it("counts each occurrence of a repeating timed block in density (regression 2.3.1)", async () => {
    const userId = await createUser();
    const day = 86_400_000;
    // Mon/Wed 80-minute Fixed series anchored 30 days back, plus a trashed one-off that adds nothing.
    const anchor = new Date(Date.now() - 30 * day);
    anchor.setUTCHours(15, 0, 0, 0);
    await asOwner(async (pg) => {
        await pg.query(
            `insert into tasks (user_id, title, order_index, recurrence_rule, scheduled_start, scheduled_end, zone, interaction_mode)
             values ($1, 'Class', 0, 'FREQ=WEEKLY;BYDAY=MO,WE', $2, $3, 'UTC', 'timetable')`,
            [userId, anchor.toISOString(), new Date(anchor.getTime() + 80 * 60_000).toISOString()],
        );
        const recent = new Date(Date.now() - 2 * day);
        await pg.query(
            `insert into tasks (user_id, title, order_index, scheduled_start, scheduled_end, zone, state)
             values ($1, 'Gone', 0, $2, $3, 'UTC', 'ARCHIVED')`,
            [userId, recent.toISOString(), new Date(recent.getTime() + 600 * 60_000).toISOString()],
        );
    });
    await computeWorkloadSignals(getTestDb(), userId);
    const { schedule_density } = await asOwner(
        async (pg) =>
            (
                await pg.query<{ schedule_density: string }>(
                    "select schedule_density from user_metrics where user_id = $1",
                    [userId],
                )
            ).rows[0],
    );
    // Past 7 days: 2 Mon/Wed starts at 15:00 UTC, unless today's hasn't started yet.
    let expected = 0;
    // i = 7 too: late in the UTC day, last week's same weekday is still inside the window.
    for (let i = 0; i <= 7; i++) {
        const d = new Date(Date.now() - i * day);
        d.setUTCHours(15, 0, 0, 0);
        if ([1, 3].includes(d.getUTCDay()) && d.getTime() <= Date.now() && d.getTime() >= Date.now() - 7 * day)
            expected += 80;
    }
    expect(expected).toBeGreaterThan(0);
    expect(Number(schedule_density)).toBeCloseTo(expected / 7, 1);
});
