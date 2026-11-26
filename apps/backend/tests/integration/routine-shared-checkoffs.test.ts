import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { habitRoutes } from "../../src/domains/habits/habits.route";
import { routineSharingRoutes } from "../../src/domains/habits/routine-sharing.route";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";

beforeAll(startTestDb);

const today = new Date().toISOString().slice(0, 10);

describe("shared routine check-offs", () => {
    it("together mode: independent streaks, others shows only COMPLETED, member prefs isolated", async () => {
        const owner = await createUser({ name: "Tori" });
        const sam = await createUser({ name: "Sam" });
        const hOwner = apiAs(owner, "/habits", habitRoutes);
        const hSam = apiAs(sam, "/habits", habitRoutes);
        const sOwner = apiAs(owner, "/habits", routineSharingRoutes);
        const listsSam = apiAs(sam, "/lists", sharingRoutes);

        const habit = (
            await hOwner("POST", "", { title: "Yoga", recurrenceRule: "FREQ=DAILY", reminderEnabled: false })
        ).body.data;
        const url = (await sOwner("POST", `/${habit.id}/invites`, { way: "together" })).body.data.url as string;
        await listsSam("POST", "/join", { token: tokenOf(url) });

        const ownerRes = await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" });
        expect(ownerRes.status, JSON.stringify(ownerRes.body)).toBe(200);
        expect(ownerRes.body.data.habit.currentStreak, JSON.stringify(ownerRes.body.data)).toBe(1);
        await hSam("POST", `/${habit.id}/resolve`, { targetDate: today, status: "SKIPPED" });

        const samView = (await hSam("GET", `/${habit.id}`)).body.data;
        expect(samView.currentStreak).toBe(0);
        expect(samView.today.others).toEqual([{ userId: owner, status: "COMPLETED" }]);

        const ownerView = (await hOwner("GET", `/${habit.id}`)).body.data;
        expect(ownerView.currentStreak).toBe(1);
        expect(ownerView.today.others).toEqual([]);

        const patched = await hSam("PATCH", `/${habit.id}`, {
            reminderEnabled: true,
            sortOrder: 42,
            pausedUntil: "2030-01-01",
        });
        expect(patched.status).toBe(200);
        expect(patched.body.data).toMatchObject({ reminderEnabled: true, sortOrder: 42, pausedUntil: "2030-01-01" });

        const ownerAfter = (await hOwner("GET", `/${habit.id}`)).body.data;
        expect(ownerAfter.reminderEnabled).toBe(false);
        expect(ownerAfter.pausedUntil).toBeNull();

        expect((await hSam("PATCH", `/${habit.id}`, { archived: true })).status).toBe(403);
    });

    it("turns mode: holder gets turn, anyone can cover, skip closes for all, only logger or owner can clear, one household streak", async () => {
        const owner = await createUser({ name: "Tori" });
        const sam = await createUser({ name: "Sam" });
        const hOwner = apiAs(owner, "/habits", habitRoutes);
        const hSam = apiAs(sam, "/habits", habitRoutes);
        const sOwner = apiAs(owner, "/habits", routineSharingRoutes);
        const listsSam = apiAs(sam, "/lists", sharingRoutes);

        const habit = (await hOwner("POST", "", { title: "Clean kitchen", recurrenceRule: "FREQ=DAILY" })).body.data;
        const url = (await sOwner("POST", `/${habit.id}/invites`, { way: "turns" })).body.data.url as string;
        await listsSam("POST", "/join", { token: tokenOf(url) });

        expect((await hOwner("GET", `/${habit.id}`)).body.data.today.turn).toBe(owner);

        const covered = await hSam("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" });
        expect(covered.status).toBe(200);
        expect((await hOwner("GET", `/${habit.id}`)).body.data.currentStreak).toBe(1);
        expect((await hSam("GET", `/${habit.id}`)).body.data.currentStreak).toBe(1);

        const noop = await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" });
        expect(noop.body.data.log.userId).toBe(sam);

        const cleared = await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "PENDING" });
        expect(cleared.status).toBe(200);
        expect(cleared.body.data.log.status).toBe("PENDING");

        await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" });
        expect((await hSam("POST", `/${habit.id}/resolve`, { targetDate: today, status: "PENDING" })).status).toBe(403);
    });

    it("supporter mode: sees done days only, zero streak, and 403 on log; editing steps re-derives every person's day", async () => {
        const owner = await createUser({ name: "Tori" });
        const sam = await createUser({ name: "Sam" });
        const kai = await createUser({ name: "Kai" });
        const hOwner = apiAs(owner, "/habits", habitRoutes);
        const hSam = apiAs(sam, "/habits", habitRoutes);
        const hKai = apiAs(kai, "/habits", habitRoutes);
        const sOwner = apiAs(owner, "/habits", routineSharingRoutes);
        const listsSam = apiAs(sam, "/lists", sharingRoutes);
        const listsKai = apiAs(kai, "/lists", sharingRoutes);

        const habit = (
            await hOwner("POST", "", {
                title: "Morning routine",
                recurrenceRule: "FREQ=DAILY",
                steps: [
                    { id: "s1", title: "Water" },
                    { id: "s2", title: "Stretch" },
                ],
            })
        ).body.data;

        const togetherUrl = (await sOwner("POST", `/${habit.id}/invites`, { way: "together" })).body.data.url as string;
        const cheerUrl = (await sOwner("POST", `/${habit.id}/invites`, { way: "cheering" })).body.data.url as string;
        await listsSam("POST", "/join", { token: tokenOf(togetherUrl) });
        await listsKai("POST", "/join", { token: tokenOf(cheerUrl) });

        expect((await hKai("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" })).status).toBe(
            403,
        );

        await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "SKIPPED" });
        const kaiWeekly = (await hKai("GET", `/weekly?start=${today}&end=${today}`)).body.data;
        expect(kaiWeekly[0].currentStreak).toBe(0);
        expect(kaiWeekly[0].logs[0].status).toBe("PENDING");

        await hSam("POST", `/${habit.id}/resolve`, {
            targetDate: today,
            status: "PENDING",
            stepStatus: { s1: "COMPLETED" },
        });
        await hOwner("PATCH", `/${habit.id}`, { steps: [{ id: "s1", title: "Water" }] });
        const samWeekly = (await hSam("GET", `/weekly?start=${today}&end=${today}`)).body.data;
        expect(samWeekly[0].logs[0].status).toBe("COMPLETED");
    });

    it("participant editing steps or shifting set times re-derives everyone's day and migrates marks without RLS errors", async () => {
        const owner = await createUser({ name: "Tori" });
        const sam = await createUser({ name: "Sam" });
        const hOwner = apiAs(owner, "/habits", habitRoutes);
        const hSam = apiAs(sam, "/habits", habitRoutes);
        const sOwner = apiAs(owner, "/habits", routineSharingRoutes);
        const listsSam = apiAs(sam, "/lists", sharingRoutes);

        const stepHabit = (
            await hOwner("POST", "", {
                title: "Evening wind-down",
                recurrenceRule: "FREQ=DAILY",
                steps: [{ id: "s1", title: "Tea" }],
            })
        ).body.data;
        const link1 = (await sOwner("POST", `/${stepHabit.id}/invites`, { way: "together" })).body.data.url as string;
        await listsSam("POST", "/join", { token: tokenOf(link1) });

        await hOwner("POST", `/${stepHabit.id}/resolve`, {
            targetDate: today,
            status: "PENDING",
            stepStatus: { s1: "COMPLETED" },
        });
        await hSam("POST", `/${stepHabit.id}/resolve`, {
            targetDate: today,
            status: "PENDING",
            stepStatus: { s1: "COMPLETED" },
        });
        expect((await hSam("GET", `/${stepHabit.id}`)).body.data.currentStreak).toBe(1);

        const stepPatch = await hSam("PATCH", `/${stepHabit.id}`, {
            steps: [
                { id: "s1", title: "Tea" },
                { id: "s2", title: "Read" },
            ],
        });
        expect(stepPatch.status).toBe(200);
        expect((await hSam("GET", `/${stepHabit.id}`)).body.data.currentStreak).toBe(0);
        expect((await hOwner("GET", `/weekly?start=${today}&end=${today}`)).body.data[0].logs[0].status).toBe(
            "PENDING",
        );

        const timedHabit = (
            await hOwner("POST", "", {
                title: "Meds",
                recurrenceRule: "FREQ=DAILY",
                times: ["08:00", "14:00"],
            })
        ).body.data;
        const link2 = (await sOwner("POST", `/${timedHabit.id}/invites`, { way: "together" })).body.data.url as string;
        await listsSam("POST", "/join", { token: tokenOf(link2) });

        await hOwner("POST", `/${timedHabit.id}/resolve`, {
            targetDate: today,
            time: "14:00",
            status: "COMPLETED",
        });
        await hSam("POST", `/${timedHabit.id}/resolve`, {
            targetDate: today,
            time: "14:00",
            status: "COMPLETED",
        });

        const shifted = await hSam("PATCH", `/${timedHabit.id}`, { times: ["08:00", "14:30"] });
        expect(shifted.status).toBe(200);
        const ownerTimed = (await hOwner("GET", `/weekly?start=${today}&end=${today}`)).body.data.find(
            (h: { id: string }) => h.id === timedHabit.id,
        );
        const samTimed = (await hSam("GET", `/weekly?start=${today}&end=${today}`)).body.data.find(
            (h: { id: string }) => h.id === timedHabit.id,
        );
        expect(ownerTimed.logs[0].timeMarks).toHaveProperty("14:30");
        expect(samTimed.logs[0].timeMarks).toHaveProperty("14:30");
    });
});
