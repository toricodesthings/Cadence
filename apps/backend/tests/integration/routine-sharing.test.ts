import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { habitRoutes } from "../../src/domains/habits/habits.route";
import { routineSharingRoutes } from "../../src/domains/habits/routine-sharing.route";
import { personalEventRoutes } from "../../src/domains/personal-events/personal-events.route";
import { personalEventSharingRoutes } from "../../src/domains/personal-events/personal-event-sharing.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";

beforeAll(startTestDb);

async function routineSetup(title = "Morning yoga") {
    const owner = await createUser({ name: "Tori" });
    const habitsAs = (u: string) => apiAs(u, "/habits", habitRoutes);
    const shareAs = (u: string) => apiAs(u, "/habits", routineSharingRoutes);
    const listsAs = (u: string) => apiAs(u, "/lists", sharingRoutes);

    const habit = (await habitsAs(owner)("POST", "", { title, recurrenceRule: "FREQ=DAILY", emoji: "🧘" })).body.data;
    const link = async (way: "together" | "turns" | "cheering") =>
        (await shareAs(owner)("POST", `/${habit.id}/invites`, { way })).body.data.url as string;
    const join = async (u: string, url: string) => listsAs(u)("POST", "/join", { token: tokenOf(url) });

    return { owner, habit, habitsAs, shareAs, listsAs, link, join };
}

describe("routine sharing", () => {
    it("previews and joins each way, and returns 409 MODE_SET on mode clash", async () => {
        const { owner, habit, shareAs, listsAs, link, join } = await routineSetup();
        const sam = await createUser({ name: "Sam" });
        const kai = await createUser({ name: "Kai" });

        const togetherUrl = await link("together");
        const preview = await listsAs(sam)("GET", `/invite-preview?token=${tokenOf(togetherUrl)}`);
        expect(preview.status).toBe(200);
        expect(preview.body.data).toMatchObject({
            kind: "routine",
            routineId: habit.id,
            title: "Morning yoga",
            way: "together",
            ownerId: owner,
            ownerName: "Tori",
        });

        const clash = await shareAs(owner)("POST", `/${habit.id}/invites`, { way: "turns" });
        expect(clash.status).toBe(409);
        expect(clash.body.error.code).toBe("MODE_SET");

        const cheerUrl = await link("cheering");
        expect((await listsAs(kai)("GET", `/invite-preview?token=${tokenOf(cheerUrl)}`)).body.data.way).toBe(
            "cheering",
        );

        expect((await join(sam, togetherUrl)).body.data).toEqual({ kind: "routine", routineId: habit.id });
        expect((await join(kai, cheerUrl)).body.data).toEqual({ kind: "routine", routineId: habit.id });

        const people = (await shareAs(owner)("GET", `/${habit.id}/people`)).body.data;
        expect(people.map((p: { name: string; role: string }) => [p.name, p.role])).toEqual([
            ["Tori", "owner"],
            ["Sam", "edit"],
            ["Kai", "view"],
        ]);
    });

    it("enforces ceilings, reorders turns on leave/remove, and clears mode/turns on stop sharing", async () => {
        const { owner, habit, habitsAs, shareAs, link, join } = await routineSetup("Clean kitchen");
        const sam = await createUser({ name: "Sam" });
        const kai = await createUser({ name: "Kai" });

        const turnsUrl = await link("turns");
        await join(sam, turnsUrl);
        await join(kai, turnsUrl);

        const putTurns = await shareAs(owner)("PUT", `/${habit.id}/turns`, { order: [sam, kai, owner] });
        expect(putTurns.status).toBe(200);
        expect((await shareAs(owner)("PUT", `/${habit.id}/turns`, { order: [sam, owner] })).status).toBe(400);

        expect((await shareAs(owner)("DELETE", `/${habit.id}/members/${kai}`)).status).toBe(200);
        const afterRemove = (await habitsAs(owner)("GET", `/${habit.id}`)).body.data;
        expect(afterRemove.turnOrder).toEqual([sam, owner]);

        await join(kai, turnsUrl);
        expect((await shareAs(sam)("DELETE", `/${habit.id}/members/${sam}`)).status).toBe(200);
        const afterLeave = (await habitsAs(owner)("GET", `/${habit.id}`)).body.data;
        expect(afterLeave.turnOrder).toEqual([owner, kai]);
        const stored = await asOwner(
            async (pg) =>
                (
                    await pg.query<{ turn_order: string[] | null }>("SELECT turn_order FROM habits WHERE id = $1", [
                        habit.id,
                    ])
                ).rows[0],
        );
        expect(stored.turn_order).toEqual([owner, kai]);

        expect((await shareAs(owner)("DELETE", `/${habit.id}/members`)).status).toBe(200);
        const afterStop = (await habitsAs(owner)("GET", `/${habit.id}`)).body.data;
        expect(afterStop.shareMode).toBeNull();
        expect(afterStop.turnOrder).toBeNull();
        expect(afterStop.members).toEqual([]);

        const { link: otherLink, join: otherJoin } = await routineSetup("Walk");
        const busy = await createUser();
        await asOwner(async (pg) => {
            for (let i = 0; i < 100; i++) {
                const u = crypto.randomUUID();
                const h = crypto.randomUUID();
                await pg.query("INSERT INTO users (id) VALUES ($1)", [u]);
                await pg.query(
                    "INSERT INTO habits (id, user_id, title, recurrence_rule) VALUES ($1, $2, 'x', 'FREQ=DAILY')",
                    [h, u],
                );
                await pg.query("INSERT INTO routine_members (habit_id, user_id, role) VALUES ($1, $2, 'edit')", [
                    h,
                    busy,
                ]);
            }
        });
        const url = await otherLink("together");
        const over = await otherJoin(busy, url);
        expect(over.status).toBe(413);
        expect(over.body.error.code).toBe("SHARE_LIMIT");
    });

    it("handles cheers idempotently, rejects strangers, and keeps list/event joins working", async () => {
        const { owner, habit, habitsAs, shareAs, listsAs, link, join } = await routineSetup("Run");
        const kai = await createUser({ name: "Kai" });
        const stranger = await createUser({ name: "Stranger" });
        await join(kai, await link("cheering"));

        const today = new Date().toISOString().slice(0, 10);
        expect((await shareAs(stranger)("POST", `/${habit.id}/cheers`, { targetDate: today })).status).toBe(404);
        expect((await shareAs(kai)("POST", `/${habit.id}/cheers`, { targetDate: today })).status).toBe(204);
        expect((await shareAs(kai)("POST", `/${habit.id}/cheers`, { targetDate: today })).status).toBe(204);

        const ownerView = (await habitsAs(owner)("GET", `/${habit.id}`)).body.data;
        expect(ownerView.today.cheers).toEqual([kai]);

        const list = (await apiAs(owner, "/projects", projectRoutes)("POST", "", { name: "List" })).body.data;
        const listUrl = (await listsAs(owner)("POST", `/${list.id}/invites`)).body.data.url as string;
        expect((await listsAs(kai)("POST", "/join", { token: tokenOf(listUrl) })).body.data).toEqual({
            kind: "list",
            listId: list.id,
        });
        const evt = (
            await apiAs(owner, "/personal-events", personalEventRoutes)("POST", "", { label: "Day", monthDay: "05-05" })
        ).body.data;
        const evtUrl = (
            await apiAs(owner, "/personal-events", personalEventSharingRoutes)("POST", `/${evt.id}/invites`)
        ).body.data.url as string;
        expect((await listsAs(kai)("POST", "/join", { token: tokenOf(evtUrl) })).body.data).toEqual({
            kind: "event",
            eventId: evt.id,
        });
    });
});
