import { beforeAll, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { habitRoutes } from "../../src/domains/habits/habits.route";

beforeAll(startTestDb);

it("a routine is made, ticked off, skipped without penalty, and cleared", async () => {
    const habits = apiAs(await createUser(), "/habits", habitRoutes);
    const today = new Date().toISOString().slice(0, 10);

    const habit = (await habits("POST", "", { title: "Stretch", recurrenceRule: "FREQ=DAILY" })).body.data;

    const done = await habits("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" });
    expect(done.body.data.habit).toMatchObject({ currentStreak: 1, totalCompletions: 1 });

    // A skip is a quiet "not today": nothing is owed and the count simply restarts.
    const skipped = await habits("POST", `/${habit.id}/resolve`, { targetDate: today, status: "SKIPPED" });
    expect(skipped.body.data.habit).toMatchObject({ currentStreak: 0, totalCompletions: 0, totalSkips: 1 });

    expect((await habits("GET", `/${habit.id}`)).body.data).toMatchObject({ id: habit.id, title: "Stretch" });
});
