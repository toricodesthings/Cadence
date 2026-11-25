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

        // Owner checks off today; Sam skips today.
        const ownerRes = await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" });
        expect(ownerRes.status, JSON.stringify(ownerRes.body)).toBe(200);
        expect(ownerRes.body.data.habit.currentStreak, JSON.stringify(ownerRes.body.data)).toBe(1);
        await hSam("POST", `/${habit.id}/resolve`, { targetDate: today, status: "SKIPPED" });

        // Sam sees Tori in others (COMPLETED), own streak 0.
        const samView = (await hSam("GET", `/${habit.id}`)).body.data;
        expect(samView.currentStreak).toBe(0);
        expect(samView.today.others).toEqual([{ userId: owner, status: "COMPLETED" }]);

        // Owner sees NO others (Sam's SKIPPED is never shown), own streak 1.
        const ownerView = (await hOwner("GET", `/${habit.id}`)).body.data;
        expect(ownerView.currentStreak).toBe(1);
        expect(ownerView.today.others).toEqual([]);

        // Member personal prefs (reminder, sortOrder, pausedUntil) don't touch owner.
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

        // Owner-only field by member -> 403.
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

        // Today is owner's turn.
        expect((await hOwner("GET", `/${habit.id}`)).body.data.today.turn).toBe(owner);

        // Sam covers owner's turn -> day closes for both, household streak = 1.
        const covered = await hSam("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" });
        expect(covered.status).toBe(200);
        expect((await hOwner("GET", `/${habit.id}`)).body.data.currentStreak).toBe(1);
        expect((await hSam("GET", `/${habit.id}`)).body.data.currentStreak).toBe(1);

        // Owner marking COMPLETED is a no-op returning Sam's log.
        const noop = await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" });
        expect(noop.body.data.log.userId).toBe(sam);

        // Owner CAN clear Sam's log.
        const cleared = await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "PENDING" });
        expect(cleared.status).toBe(200);
        expect(cleared.body.data.log.status).toBe("PENDING");

        // Owner logs COMPLETED -> Sam CANNOT clear owner's log (403).
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

        // Supporter cannot log (403).
        expect((await hKai("POST", `/${habit.id}/resolve`, { targetDate: today, status: "COMPLETED" })).status).toBe(
            403,
        );

        // Owner skips today; supporter weekly view shows PENDING (never SKIPPED) and 0 streak.
        await hOwner("POST", `/${habit.id}/resolve`, { targetDate: today, status: "SKIPPED" });
        const kaiWeekly = (await hKai("GET", `/weekly?start=${today}&end=${today}`)).body.data;
        expect(kaiWeekly[0].currentStreak).toBe(0);
        expect(kaiWeekly[0].logs[0].status).toBe("PENDING");

        // Sam marks step s1 done (day still PENDING because s2 is open).
        await hSam("POST", `/${habit.id}/resolve`, {
            targetDate: today,
            status: "PENDING",
            stepStatus: { s1: "COMPLETED" },
        });
        // Owner removes step s2 -> Sam's day re-derives to COMPLETED!
        await hOwner("PATCH", `/${habit.id}`, { steps: [{ id: "s1", title: "Water" }] });
        const samWeekly = (await hSam("GET", `/weekly?start=${today}&end=${today}`)).body.data;
        expect(samWeekly[0].logs[0].status).toBe("COMPLETED");
    });
});
