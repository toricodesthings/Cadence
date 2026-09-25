import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { habitRoutes } from "../../src/domains/habits/habits.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";

/** UTC calendar date `offset` days from today, as YYYY-MM-DD. */
function day(offset = 0) {
    return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

let habits: ReturnType<typeof apiAs>;
let tags: ReturnType<typeof apiAs>;
let otherHabits: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUser();
    habits = apiAs(userId, "/habits", habitRoutes);
    tags = apiAs(userId, "/tags", tagRoutes);
    otherHabits = apiAs(await createUser(), "/habits", habitRoutes);
});

async function create(body: Record<string, unknown> = {}, client = habits) {
    const res = await client("POST", "", { title: "Stretch", recurrenceRule: "FREQ=DAILY", ...body });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data;
}

/** Makes a habit look `days` old so past occurrences exist to resolve. */
async function backdate(habitId: string, days: number) {
    await asOwner((pg) => pg.query("UPDATE habits SET created_at = created_at - make_interval(days => $2) WHERE id = $1", [habitId, days]));
}

const resolve = (id: string, targetDate: string, status: string) => habits("POST", `/${id}/resolve`, { targetDate, status });

describe("creating and listing habits", () => {
    it("creates a habit with DB defaults and its tags", async () => {
        const { body: tag } = await tags("POST", "", { name: "health" });

        const habit = await create({ tagIds: [tag.data.id] });

        expect(habit).toMatchObject({ title: "Stretch", archived: false, currentStreak: 0, totalCompletions: 0, tagIds: [tag.data.id] });
    });

    it("refuses another user's tag", async () => {
        const theirTag = (await apiAs(await createUser(), "/tags", tagRoutes)("POST", "", { name: "x" })).body.data;

        expect((await habits("POST", "", { title: "T", recurrenceRule: "FREQ=DAILY", tagIds: [theirTag.id] })).status).toBe(404);
    });

    it("lists active habits by default and archived ones on request, for the caller only", async () => {
        await create({ title: "Active" });
        const archived = await create({ title: "Old" });
        await habits("PATCH", `/${archived.id}`, { archived: true });
        await create({ title: "Theirs" }, otherHabits);

        expect((await habits("GET", "")).body.data.map((h: any) => h.title)).toEqual(["Active"]);
        expect((await habits("GET", "?archived=true")).body.data.map((h: any) => h.title)).toEqual(["Old"]);
    });
});

describe("updating habits", () => {
    it("archiving leaves colour and reminder untouched (regression: partial update reset them)", async () => {
        const habit = await create({ colorAccent: "emerald", reminderEnabled: true });

        const { body } = await habits("PATCH", `/${habit.id}`, { archived: true });

        expect(body.data).toMatchObject({ archived: true, colorAccent: "emerald", reminderEnabled: true });
    });

    it("replaces the tag set when tagIds is sent and keeps it when omitted", async () => {
        const [a, b] = [(await tags("POST", "", { name: "a" })).body.data, (await tags("POST", "", { name: "b" })).body.data];
        const habit = await create({ tagIds: [a.id] });

        expect((await habits("PATCH", `/${habit.id}`, { tagIds: [b.id] })).body.data.tagIds).toEqual([b.id]);
        expect((await habits("PATCH", `/${habit.id}`, { title: "Renamed" })).body.data.tagIds).toEqual([b.id]);
    });

    it("accepts the updatedAt it served as expectedUpdatedAt, and rejects a stale one with 409", async () => {
        const habit = await create();
        const { body: fresh } = await habits("GET", `/${habit.id}`);

        expect((await habits("PATCH", `/${habit.id}`, { title: "A", expectedUpdatedAt: fresh.data.updatedAt })).status).toBe(200);
        expect((await habits("PATCH", `/${habit.id}`, { title: "B", expectedUpdatedAt: fresh.data.updatedAt })).status).toBe(409);
    });

    it("treats another user's habit as not found for read, update, and delete, and never syncs tags onto it", async () => {
        const theirs = await create({ title: "Theirs" }, otherHabits);
        const { body: myTag } = await tags("POST", "", { name: "mine" });

        expect((await habits("GET", `/${theirs.id}`)).status).toBe(404);
        expect((await habits("PATCH", `/${theirs.id}`, { title: "hijacked", tagIds: [myTag.data.id] })).status).toBe(404);
        expect((await habits("DELETE", `/${theirs.id}`)).status).toBe(404);
        expect((await otherHabits("GET", `/${theirs.id}`)).body.data.title).toBe("Theirs");
        const linked = await asOwner(async (pg) => (await pg.query("SELECT count(*)::int n FROM habit_tags WHERE habit_id = $1", [theirs.id])).rows[0]);
        expect(linked).toEqual({ n: 0 });
    });
});

describe("resolving occurrences", () => {
    it("completing today starts a streak; skipping it instead moves the count; clearing removes the log", async () => {
        const habit = await create();

        const done = await resolve(habit.id, day(), "COMPLETED");
        expect(done.status).toBe(200);
        expect(done.body.data.habit).toMatchObject({ currentStreak: 1, longestStreak: 1, totalCompletions: 1, totalSkips: 0 });
        expect(done.body.data.log).toMatchObject({ status: "COMPLETED", targetDate: day() });

        expect((await resolve(habit.id, day(), "SKIPPED")).body.data.habit).toMatchObject({ currentStreak: 0, totalCompletions: 0, totalSkips: 1 });

        expect((await resolve(habit.id, day(), "PENDING")).body.data.habit).toMatchObject({ totalCompletions: 0, totalSkips: 0 });
        const logs = await asOwner(async (pg) => (await pg.query("SELECT count(*)::int n FROM habit_logs WHERE habit_id = $1", [habit.id])).rows[0]);
        expect(logs).toEqual({ n: 0 });
    });

    it("steps: a partial day stays pending and kept, every step settled completes it, un-ticking reopens it", async () => {
        const habit = await create({ steps: [{ id: "water", title: "Water" }, { id: "stretch", title: "Stretch" }] });
        const steps = (stepStatus: Record<string, string>) => habits("POST", `/${habit.id}/resolve`, { targetDate: day(), status: "PENDING", stepStatus });

        const partial = await steps({ water: "COMPLETED" });
        expect(partial.body.data.log).toMatchObject({ status: "PENDING", stepStatus: { water: "COMPLETED" } });
        expect(partial.body.data.habit).toMatchObject({ totalCompletions: 0, currentStreak: 0 });

        const all = await steps({ water: "COMPLETED", stretch: "SKIPPED" });
        expect(all.body.data.log.status).toBe("COMPLETED");
        expect(all.body.data.habit).toMatchObject({ totalCompletions: 1, currentStreak: 1 });

        const reopened = await steps({ stretch: "SKIPPED" });
        expect(reopened.body.data.log).toMatchObject({ status: "PENDING", stepStatus: { stretch: "SKIPPED" } });
        expect(reopened.body.data.habit).toMatchObject({ totalCompletions: 0, currentStreak: 0 });

        const { body } = await habits("GET", `/weekly?start=${day()}&end=${day()}`);
        expect(body.data[0].logs[0]).toMatchObject({ status: "PENDING", stepStatus: { stretch: "SKIPPED" } });

        expect((await steps({})).body.data.log.status).toBe("PENDING");
        const logs = await asOwner(async (pg) => (await pg.query("SELECT count(*)::int n FROM habit_logs WHERE habit_id = $1", [habit.id])).rows[0]);
        expect(logs).toEqual({ n: 0 });
    });

    it("a skipped day is neutral: done, skip, done keeps a run of 2 whichever day is logged last", async () => {
        const habit = await create();
        await backdate(habit.id, 3);
        await resolve(habit.id, day(-3), "COMPLETED");
        await resolve(habit.id, day(-1), "COMPLETED");
        await resolve(habit.id, day(-2), "SKIPPED"); // backfill path: full recompute
        expect((await habits("GET", `/${habit.id}`)).body.data).toMatchObject({ currentStreak: 2, longestStreak: 2 });
        expect((await resolve(habit.id, day(), "COMPLETED")).body.data.habit).toMatchObject({ currentStreak: 3 }); // today: backward walk
    });

    it("counts a streak across past days, and un-completing one splits it without lowering the record", async () => {
        const habit = await create();
        await backdate(habit.id, 4);
        for (const offset of [-4, -3, -2, -1, 0]) await resolve(habit.id, day(offset), "COMPLETED");

        expect((await habits("GET", `/${habit.id}`)).body.data).toMatchObject({ currentStreak: 5, longestStreak: 5, totalCompletions: 5 });

        const { body } = await resolve(habit.id, day(-2), "PENDING");

        expect(body.data.habit).toMatchObject({ currentStreak: 2, longestStreak: 5, totalCompletions: 4 });
    });

    it("keeps the streak when today is still open", async () => {
        const habit = await create();
        await backdate(habit.id, 2);
        await resolve(habit.id, day(-2), "COMPLETED");

        const { body } = await resolve(habit.id, day(-1), "COMPLETED");

        expect(body.data.habit.currentStreak).toBe(2);
    });

    it("checking off today keeps a run logged before the routine was created (regression: streak fell to 1)", async () => {
        const habit = await create();
        for (const offset of [-3, -2, -1]) await resolve(habit.id, day(offset), "COMPLETED");

        const { body } = await resolve(habit.id, day(), "COMPLETED");

        expect(body.data.habit).toMatchObject({ currentStreak: 4, longestStreak: 4 });
    });

    it("counts today as the caller's day (regression: a morning check-in in Tokyo read as UTC's yesterday)", async () => {
        vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-23T23:00:00.000Z") }); // 08:00 Sep 24 in Tokyo
        try {
            const habit = await create();
            await asOwner((pg) => pg.query("UPDATE habits SET created_at = '2026-09-01T00:00:00Z' WHERE id = $1", [habit.id]));
            const inTokyo = (targetDate: string) => habits("POST", `/${habit.id}/resolve`, { targetDate, status: "COMPLETED", timezone: "Asia/Tokyo" });
            await inTokyo("2026-09-23");

            expect((await inTokyo("2026-09-24")).body.data.habit.currentStreak).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("treats another user's habit as not found", async () => {
        const theirs = await create({}, otherHabits);

        expect((await resolve(theirs.id, day(), "COMPLETED")).status).toBe(404);
        expect((await otherHabits("GET", `/${theirs.id}`)).body.data.totalCompletions).toBe(0);
    });
});

describe("views", () => {
    it("weekly: expands each day in the window with its log, and summarizes it", async () => {
        const { body: tag } = await tags("POST", "", { name: "t" });
        const habit = await create({ tagIds: [tag.data.id] });
        await backdate(habit.id, 3);
        await resolve(habit.id, day(-2), "COMPLETED");
        await resolve(habit.id, day(-1), "SKIPPED");

        const { body } = await habits("GET", `/weekly?start=${day(-2)}&end=${day(0)}`);
        const [week] = body.data;

        expect(week.logs.map((l: any) => [l.targetDate, l.status])).toEqual([
            [day(-2), "COMPLETED"],
            [day(-1), "SKIPPED"],
            [day(0), "PENDING"],
        ]);
        expect(week).toMatchObject({
            tagIds: [tag.data.id],
            isDueToday: true,
            isOverdue: false,
            scheduledCountInWindow: 3,
            completedCountInWindow: 1,
            pendingCountInWindow: 1,
            adherenceRateInWindow: 0.33,
        });
    });

    it("weekly: a pause hides today onward, never the days already checked", async () => {
        const habit = await create();
        await backdate(habit.id, 3);
        await resolve(habit.id, day(-2), "COMPLETED");
        await habits("PATCH", `/${habit.id}`, { pausedUntil: day(3) });

        const { body } = await habits("GET", `/weekly?start=${day(-2)}&end=${day(1)}&timezone=UTC`);

        expect(body.data[0].logs.map((l: any) => [l.targetDate, l.status])).toEqual([
            [day(-2), "COMPLETED"],
            [day(-1), "PENDING"],
        ]);
        expect(body.data[0].isDueToday).toBe(false);
    });

    it("weekly: shows the day before a routine was created, and earlier days only once logged", async () => {
        const habit = await create();
        await resolve(habit.id, day(-4), "COMPLETED");

        const { body } = await habits("GET", `/weekly?start=${day(-5)}&end=${day(0)}&timezone=UTC`);

        expect(body.data[0].logs.map((l: any) => [l.targetDate, l.status])).toEqual([
            [day(-4), "COMPLETED"],
            [day(-1), "PENDING"],
            [day(0), "PENDING"],
        ]);
    });
});

describe("deleting habits", () => {
    it("deletes a habit and its logs", async () => {
        const habit = await create();
        await resolve(habit.id, day(), "COMPLETED");

        expect((await habits("DELETE", `/${habit.id}`)).status).toBe(200);
        expect((await habits("GET", `/${habit.id}`)).status).toBe(404);
        const logs = await asOwner(async (pg) => (await pg.query("SELECT count(*)::int n FROM habit_logs WHERE habit_id = $1", [habit.id])).rows[0]);
        expect(logs).toEqual({ n: 0 });
    });
});
