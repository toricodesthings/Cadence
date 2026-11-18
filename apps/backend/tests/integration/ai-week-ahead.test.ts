/** The Weekly Reset's week, read from the real database for a user in Toronto: 7 days, the user's own days. */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { loadWeekAhead, userClock } from "../../src/domains/ai/turn";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { habitRoutes } from "../../src/domains/habits/habits.route";

beforeAll(startTestDb);

// Monday 2026-09-21, 09:00 in Toronto.
const clock = userClock("America/Toronto", "2026-09-21T13:00:00.000Z");
const week = async (userId: string) =>
    JSON.parse(
        await loadWeekAhead({} as never, userId, {
            timezone: clock.timezone,
            today: clock.today,
            currentDate: clock.now.toISOString(),
        }),
    ) as Array<{
        day: string;
        bookedMinutes: number;
        openMinutes: number;
        deadlines: Array<{ id: string; title: string }>;
        more?: true;
        fixedBlocks: number;
        routinesDue: number;
    }>;

describe("loadWeekAhead", () => {
    it("an empty week is seven open days starting today, labelled with the weekday", async () => {
        const days = await week(await createUser({ zone: "America/Toronto" }));
        expect(days).toHaveLength(7);
        expect(days.map((d) => d.day)).toEqual([
            "2026-09-21 Mon",
            "2026-09-22 Tue",
            "2026-09-23 Wed",
            "2026-09-24 Thu",
            "2026-09-25 Fri",
            "2026-09-26 Sat",
            "2026-09-27 Sun",
        ]);
        for (const d of days) {
            expect(d).toMatchObject({ bookedMinutes: 0, deadlines: [], fixedBlocks: 0, routinesDue: 0 });
            expect(d.openMinutes).toBeGreaterThan(0);
            expect(d).not.toHaveProperty("more");
        }
    });

    it("counts deadlines, estimates, Fixed blocks and routines on the right day, and cuts long lists", async () => {
        const userId = await createUser({ zone: "America/Toronto" });
        const tasks = apiAs(userId, "/tasks", taskRoutes);
        const habits = apiAs(userId, "/habits", habitRoutes);
        const base = (await week(userId))[2];

        await tasks("POST", "", { title: "Tax", orderIndex: 1, dueDate: "2026-09-23", durationEstimate: 90 });
        await tasks("POST", "", { title: "x".repeat(200), orderIndex: 2, dueDate: "2026-09-23" });
        for (let i = 0; i < 5; i++)
            await tasks("POST", "", { title: `Extra ${i}`, orderIndex: 3 + i, dueDate: "2026-09-23" });
        await tasks("POST", "", { title: "Done already", orderIndex: 9, dueDate: "2026-09-23", state: "COMPLETE" });
        // Fixed class, Wednesday 10:00–11:00 local.
        await tasks("POST", "", {
            title: "Class",
            orderIndex: 10,
            interactionMode: "timetable",
            scheduledStart: "2026-09-23T14:00:00.000Z",
            scheduledEnd: "2026-09-23T15:00:00.000Z",
        });
        await habits("POST", "", { title: "Gym", recurrenceRule: "FREQ=WEEKLY;BYDAY=WE" });

        const wed = (await week(userId))[2];
        expect(wed.day).toBe("2026-09-23 Wed");
        expect(wed.bookedMinutes).toBe(150); // 90 estimated + the 60-minute class; the others have no estimate
        expect(wed.openMinutes).toBe(base.openMinutes - 150);
        expect(wed.fixedBlocks).toBe(1);
        expect(wed.routinesDue).toBe(1);
        expect(wed.deadlines).toHaveLength(5); // capped, never the 7 open deadlines
        expect(wed.more).toBe(true);
        expect(wed.deadlines.map((d) => d.title)).not.toContain("Done already");
        const other = (await week(userId))[3];
        expect(other).toMatchObject({ fixedBlocks: 0, routinesDue: 0, deadlines: [] });
    });

    it("cuts a long title to 60 characters", async () => {
        const userId = await createUser({ zone: "America/Toronto" });
        await apiAs(userId, "/tasks", taskRoutes)("POST", "", {
            title: "y".repeat(200),
            orderIndex: 1,
            dueDate: "2026-09-22",
        });
        expect((await week(userId))[1].deadlines[0].title).toHaveLength(60);
    });

    it("never shows another person's tasks, and a week with a task past day 7 leaves it out", async () => {
        const [me, other] = [
            await createUser({ zone: "America/Toronto" }),
            await createUser({ zone: "America/Toronto" }),
        ];
        await apiAs(other, "/tasks", taskRoutes)("POST", "", { title: "Theirs", orderIndex: 1, dueDate: "2026-09-22" });
        await apiAs(me, "/tasks", taskRoutes)("POST", "", { title: "Next week", orderIndex: 1, dueDate: "2026-09-28" });
        expect((await week(me)).flatMap((d) => d.deadlines)).toEqual([]);
    });
});
