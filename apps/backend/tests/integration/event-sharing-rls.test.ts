import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { eventMembers, personalEvents, shareInvites } from "../../src/db/schema";
import { withRls } from "../../src/platform/rls";

beforeAll(startTestDb);

const as = <T>(userId: string, fn: Parameters<typeof withRls<T>>[2]) => withRls(getTestDb(), userId, fn);

async function seedSharedEvent() {
    const owner = await createUser({ name: "Tori" });
    const member = await createUser({ name: "Sam" });
    const outsider = await createUser({ name: "Outsider" });
    const eventId = crypto.randomUUID();
    const privateEventId = crypto.randomUUID();
    await asOwner(async (pg) => {
        await pg.query(
            "INSERT INTO personal_events (id, user_id, label, month_day, emoji, started_on, color) VALUES ($1, $2, 'Anniversary', '06-14', '💍', '2019-06-14', 'rose')",
            [eventId, owner],
        );
        await pg.query(
            "INSERT INTO personal_events (id, user_id, label, month_day) VALUES ($1, $2, 'Private', '01-01')",
            [privateEventId, owner],
        );
        await pg.query("INSERT INTO event_members (event_id, user_id, role) VALUES ($1, $2, 'edit')", [
            eventId,
            member,
        ]);
    });
    return { owner, member, outsider, eventId, privateEventId };
}

describe("a shared event under row-level security", () => {
    it("hides the event and its members from a stranger", async () => {
        const { outsider } = await seedSharedEvent();
        expect(await as(outsider, (tx) => tx.select().from(personalEvents))).toEqual([]);
        expect(await as(outsider, (tx) => tx.select().from(eventMembers))).toEqual([]);
    });

    it("lets a member read and update the label while keeping the owner via trigger", async () => {
        const { owner, member, eventId } = await seedSharedEvent();
        const visible = await as(member, (tx) => tx.select().from(personalEvents));
        expect(visible.map((e) => e.id)).toEqual([eventId]);

        const [updated] = await as(member, (tx) =>
            tx
                .update(personalEvents)
                .set({ label: "Our anniversary", userId: member })
                .where(eq(personalEvents.id, eventId))
                .returning(),
        );
        expect(updated.label).toBe("Our anniversary");
        expect(updated.userId).toBe(owner);
    });

    it("stops a member from deleting, inserting for the owner, or inserting event_members directly", async () => {
        const { owner, member, eventId } = await seedSharedEvent();
        expect(
            await as(member, (tx) => tx.delete(personalEvents).where(eq(personalEvents.id, eventId)).returning()),
        ).toEqual([]);
        await expect(
            as(member, (tx) => tx.insert(personalEvents).values({ userId: owner, label: "Spoof", monthDay: "02-02" })),
        ).rejects.toThrow();
        await expect(
            as(member, (tx) => tx.insert(eventMembers).values({ eventId, userId: member, role: "edit" })),
        ).rejects.toThrow();
    });

    it("scopes event_members reads to the people involved", async () => {
        const { owner, member, outsider, eventId, privateEventId } = await seedSharedEvent();
        await asOwner((pg) =>
            pg.query("INSERT INTO event_members (event_id, user_id, role) VALUES ($1, $2, 'edit')", [
                privateEventId,
                outsider,
            ]),
        );

        const memberRows = await as(member, (tx) => tx.select().from(eventMembers));
        expect(memberRows.map((r) => r.eventId)).toEqual([eventId]);

        const ownerRows = await as(owner, (tx) => tx.select().from(eventMembers));
        expect(ownerRows).toHaveLength(2);
    });

    it("cascades event_members and share_invites when the event is deleted", async () => {
        const { owner, eventId } = await seedSharedEvent();
        await asOwner((pg) =>
            pg.query(
                "INSERT INTO share_invites (token_hash, event_id, role, created_by, expires_at) VALUES ($1, $2, 'edit', $3, now() + interval '1 day')",
                [`hash-${eventId}`, eventId, owner],
            ),
        );

        await as(owner, (tx) => tx.delete(personalEvents).where(eq(personalEvents.id, eventId)));

        const membersLeft = await asOwner(
            async (pg) => (await pg.query("SELECT 1 FROM event_members WHERE event_id = $1", [eventId])).rows,
        );
        const invitesLeft = await asOwner(
            async (pg) => (await pg.query("SELECT 1 FROM share_invites WHERE event_id = $1", [eventId])).rows,
        );
        expect(membersLeft).toEqual([]);
        expect(invitesLeft).toEqual([]);
    });

    it("lets cadence_set_event_notify change only the caller's notify flag without changing role", async () => {
        const { member, outsider, eventId } = await seedSharedEvent();

        const [changed] = await as(member, (tx) =>
            tx.select({ ok: sql<boolean>`r.ok` }).from(sql`cadence_set_event_notify(${eventId}::uuid, false) AS r(ok)`),
        );
        expect(changed.ok).toBe(true);

        const [outsiderChanged] = await as(outsider, (tx) =>
            tx.select({ ok: sql<boolean>`r.ok` }).from(sql`cadence_set_event_notify(${eventId}::uuid, true) AS r(ok)`),
        );
        expect(outsiderChanged.ok).toBe(false);

        const [row] = await as(member, (tx) => tx.select().from(eventMembers).where(eq(eventMembers.eventId, eventId)));
        expect(row.notify).toBe(false);
        expect(row.role).toBe("edit");

        // Direct self-update on event_members is blocked by RLS.
        expect(
            await as(member, (tx) =>
                tx.update(eventMembers).set({ role: "view" }).where(eq(eventMembers.eventId, eventId)).returning(),
            ),
        ).toEqual([]);
        expect(await as(member, (tx) => tx.select().from(shareInvites))).toEqual([]);
    });
});
