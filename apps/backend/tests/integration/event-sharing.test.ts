import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { personalEvents } from "../../src/db/schema";
import { personalEventRoutes } from "../../src/domains/personal-events/personal-events.route";
import { personalEventSharingRoutes } from "../../src/domains/personal-events/personal-event-sharing.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";

beforeAll(startTestDb);

async function anniversary() {
    const owner = await createUser({ name: "Tori", image: "data:image/png;base64,BBBB" });
    const eventsAs = (userId: string) => apiAs(userId, "/personal-events", personalEventRoutes);
    const shareAs = (userId: string) => apiAs(userId, "/personal-events", personalEventSharingRoutes);
    const listsAs = (userId: string) => apiAs(userId, "/lists", sharingRoutes);

    const event = (
        await eventsAs(owner)("POST", "", {
            label: "Our anniversary",
            monthDay: "06-14",
            emoji: "💍",
            startedOn: "2019-06-14",
            color: "rose",
            notify: true,
        })
    ).body.data;

    const link = async () => (await shareAs(owner)("POST", `/${event.id}/invites`)).body.data.url as string;
    const join = async (userId: string, url?: string) =>
        listsAs(userId)("POST", "/join", { token: tokenOf(url ?? (await link())) });

    return { owner, event, eventsAs, shareAs, listsAs, link, join };
}

describe("event sharing", () => {
    it("lets only the owner mint edit links, and previews event fields with 410 on unknown/expired/reset", async () => {
        const { owner, event, shareAs, listsAs, link, join } = await anniversary();
        const sam = await createUser({ name: "Sam" });

        const url = await link();
        const stored = await asOwner(
            async (pg) =>
                (await pg.query<{ role: string }>("SELECT role FROM share_invites WHERE event_id = $1", [event.id]))
                    .rows,
        );
        expect(stored).toEqual([{ role: "edit" }]);

        const preview = await listsAs(sam)("GET", `/invite-preview?token=${tokenOf(url)}`);
        expect(preview.status).toBe(200);
        expect(preview.body.data).toEqual({
            kind: "event",
            eventId: event.id,
            label: "Our anniversary",
            emoji: "💍",
            monthDay: "06-14",
            startedOn: "2019-06-14",
            color: "rose",
            ownerId: owner,
            ownerName: "Tori",
            ownerImage: "data:image/png;base64,BBBB",
        });

        await join(sam, url);
        const denied = await shareAs(sam)("POST", `/${event.id}/invites`);
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe("OWNER_ONLY");

        expect((await listsAs(sam)("GET", `/invite-preview?token=${"A".repeat(43)}`)).status).toBe(410);
        expect((await shareAs(owner)("DELETE", `/${event.id}/invites`)).status).toBe(200);
        expect((await listsAs(sam)("GET", `/invite-preview?token=${tokenOf(url)}`)).status).toBe(410);

        const fresh = await link();
        await asOwner((pg) =>
            pg.query("UPDATE share_invites SET expires_at = now() - interval '1 minute' WHERE event_id = $1", [
                event.id,
            ]),
        );
        expect((await listsAs(sam)("GET", `/invite-preview?token=${tokenOf(fresh)}`)).status).toBe(410);
    });

    it("accepts idempotently, skips the owner, and enforces ceilings with 413 SHARE_LIMIT", async () => {
        const { owner, event, join } = await anniversary();
        const sam = await createUser({ name: "Sam" });

        expect((await join(sam)).body.data).toEqual({ kind: "event", eventId: event.id });
        expect((await join(sam)).body.data).toEqual({ kind: "event", eventId: event.id });
        expect((await join(owner)).body.data).toEqual({ kind: "event", eventId: event.id });

        const ownerMember = await asOwner(
            async (pg) =>
                (await pg.query("SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2", [event.id, owner]))
                    .rows,
        );
        expect(ownerMember).toEqual([]);

        await asOwner(async (pg) => {
            for (let i = 0; i < 18; i++) {
                const id = crypto.randomUUID();
                await pg.query("INSERT INTO users (id) VALUES ($1)", [id]);
                await pg.query("INSERT INTO event_members (event_id, user_id) VALUES ($1, $2)", [event.id, id]);
            }
        });
        const overPeople = await join(await createUser());
        expect(overPeople.status).toBe(413);
        expect(overPeople.body.error.code).toBe("SHARE_LIMIT");

        const { join: joinAnother } = await anniversary();
        const busy = await createUser();
        await asOwner(async (pg) => {
            for (let i = 0; i < 100; i++) {
                const otherOwner = crypto.randomUUID();
                const otherEvent = crypto.randomUUID();
                await pg.query("INSERT INTO users (id) VALUES ($1)", [otherOwner]);
                await pg.query(
                    "INSERT INTO personal_events (id, user_id, label, month_day) VALUES ($1, $2, 'x', '01-01')",
                    [otherEvent, otherOwner],
                );
                await pg.query("INSERT INTO event_members (event_id, user_id) VALUES ($1, $2)", [otherEvent, busy]);
            }
        });
        const overJoined = await joinAnother(busy);
        expect(overJoined.status).toBe(413);
        expect(overJoined.body.error.code).toBe("SHARE_LIMIT");
    });

    it("returns shared events with access, members, and per-person notify, and lets members edit", async () => {
        const { owner, event, eventsAs, join } = await anniversary();
        const sam = await createUser({ name: "Sam" });
        await join(sam);

        const samList = (await eventsAs(sam)("GET", "")).body.data;
        expect(samList).toMatchObject([
            {
                id: event.id,
                label: "Our anniversary",
                notify: true,
                access: "edit",
                members: [{ userId: sam, role: "edit", invitedBy: owner }],
            },
        ]);

        const ownerList = (await eventsAs(owner)("GET", "")).body.data;
        expect(ownerList).toMatchObject([
            {
                id: event.id,
                notify: true,
                access: "owner",
                members: [{ userId: sam, role: "edit", invitedBy: owner }],
            },
        ]);

        const patched = await eventsAs(sam)("PATCH", `/${event.id}`, {
            label: "Wedding anniversary",
            notify: false,
        });
        expect(patched.status).toBe(200);
        expect(patched.body.data).toMatchObject({ label: "Wedding anniversary", notify: false });

        const ownerAfter = (await eventsAs(owner)("GET", "")).body.data;
        expect(ownerAfter[0]).toMatchObject({ label: "Wedding anniversary", notify: true });

        const samAfter = (await eventsAs(sam)("GET", "")).body.data;
        expect(samAfter[0]).toMatchObject({ label: "Wedding anniversary", notify: false });

        expect((await eventsAs(sam)("DELETE", `/${event.id}`)).status).toBe(403);
        expect((await eventsAs(owner)("DELETE", `/${event.id}`)).status).toBe(200);
        expect((await eventsAs(sam)("GET", "")).body.data).toEqual([]);
        expect(personalEvents).toBeTruthy();
    });

    it("handles remove someone, remove from my events, stop sharing, owner self-remove, and list join regression", async () => {
        const { owner, event, eventsAs, shareAs, listsAs, link, join } = await anniversary();
        const sam = await createUser({ name: "Sam" });
        const kai = await createUser({ name: "Kai" });
        const url = await link();
        await join(sam, url);
        await join(kai, url);

        const people = (await shareAs(sam)("GET", `/${event.id}/people`)).body.data;
        expect(people.map((p: { name: string }) => p.name)).toEqual(["Tori", "Sam", "Kai"]);

        expect((await shareAs(sam)("DELETE", `/${event.id}/members/${kai}`)).status).toBe(403);
        expect((await shareAs(owner)("DELETE", `/${event.id}/members/${owner}`)).status).toBe(403);

        expect((await shareAs(sam)("DELETE", `/${event.id}/members/${sam}`)).status).toBe(200);
        expect((await eventsAs(sam)("GET", "")).body.data).toEqual([]);

        expect((await shareAs(owner)("DELETE", `/${event.id}/members/${kai}`)).status).toBe(200);
        expect((await eventsAs(kai)("GET", "")).body.data).toEqual([]);

        await join(sam, url);
        expect((await shareAs(owner)("DELETE", `/${event.id}/members`)).status).toBe(200);
        expect((await eventsAs(sam)("GET", "")).body.data).toEqual([]);
        expect((await join(sam, url)).status).toBe(410);

        const list = (await apiAs(owner, "/projects", projectRoutes)("POST", "", { name: "Groceries" })).body.data;
        const listUrl = (await listsAs(owner)("POST", `/${list.id}/invites`)).body.data.url as string;
        const joinedList = await listsAs(sam)("POST", "/join", { token: tokenOf(listUrl) });
        expect(joinedList.status).toBe(200);
        expect(joinedList.body.data).toEqual({ kind: "list", listId: list.id });
    });
});
