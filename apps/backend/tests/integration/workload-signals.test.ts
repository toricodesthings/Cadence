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
    let expected = 0;
    for (let i = 0; i <= 7; i++) {
        const d = new Date(Date.now() - i * day);
        d.setUTCHours(15, 0, 0, 0);
        if ([1, 3].includes(d.getUTCDay()) && d.getTime() <= Date.now() && d.getTime() >= Date.now() - 7 * day)
            expected += 80;
    }
    expect(expected).toBeGreaterThan(0);
    expect(Number(schedule_density)).toBeCloseTo(expected / 7, 1);
});

it("weighs shared work by share: taken by you fully, untaken split across owner and editors, taken by others not at all", async () => {
    const [owner, member] = [await createUser(), await createUser()];
    const listId = crypto.randomUUID();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await asOwner(async (pg) => {
        await pg.query("insert into projects (id, user_id, name) values ($1, $2, 'Our House')", [listId, owner]);
        await pg.query("insert into list_members (list_id, user_id, role) values ($1, $2, 'edit')", [listId, member]);
        for (const takenBy of [null, member, owner, owner])
            await pg.query(
                "insert into tasks (user_id, project_id, title, order_index, due_on, taken_by) values ($1, $2, 'Chore', 0, '2020-01-01', $3)",
                [owner, listId, takenBy],
            );
        await pg.query(
            "insert into tasks (user_id, project_id, title, order_index, scheduled_start, scheduled_end, zone) values ($1, $2, 'Clean', 0, $3, $4, 'UTC')",
            [owner, listId, twoDaysAgo.toISOString(), new Date(twoDaysAgo.getTime() + 3_600_000).toISOString()],
        );
    });
    const signals = async (userId: string) => {
        await computeWorkloadSignals(getTestDb(), userId);
        return asOwner(
            async (pg) =>
                (
                    await pg.query<any>(
                        "select overdue_carry_load, current_burnout_index, schedule_density from user_metrics where user_id = $1",
                        [userId],
                    )
                ).rows[0],
        );
    };
    expect(await signals(member)).toMatchObject({ overdue_carry_load: 2, current_burnout_index: 36 });
    expect(await signals(owner)).toMatchObject({ overdue_carry_load: 3, current_burnout_index: 39 });
    expect(Number((await signals(member)).schedule_density)).toBeCloseTo(30 / 7, 1);
});
