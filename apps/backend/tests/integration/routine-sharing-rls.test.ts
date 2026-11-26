import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { habitLogs, habits, routineCheers, routineMembers } from "../../src/db/schema";
import { withRls } from "../../src/platform/rls";

beforeAll(startTestDb);

const as = <T>(userId: string, fn: Parameters<typeof withRls<T>>[2]) => withRls(getTestDb(), userId, fn);

async function seedSharedRoutine() {
    const owner = await createUser({ name: "Tori" });
    const participant = await createUser({ name: "Sam" });
    const supporter = await createUser({ name: "Kai" });
    const outsider = await createUser({ name: "Outsider" });
    const habitId = crypto.randomUUID();
    await asOwner(async (pg) => {
        await pg.query(
            "INSERT INTO habits (id, user_id, title, recurrence_rule, share_mode) VALUES ($1, $2, 'Morning yoga', 'FREQ=DAILY', 'together')",
            [habitId, owner],
        );
        await pg.query("INSERT INTO routine_members (habit_id, user_id, role) VALUES ($1, $2, 'edit')", [
            habitId,
            participant,
        ]);
        await pg.query("INSERT INTO routine_members (habit_id, user_id, role) VALUES ($1, $2, 'view')", [
            habitId,
            supporter,
        ]);
        await pg.query(
            "INSERT INTO habit_logs (habit_id, user_id, status, target_date) VALUES ($1, $2, 'COMPLETED', '2026-11-24')",
            [habitId, owner],
        );
    });
    return { owner, participant, supporter, outsider, habitId };
}

describe("a shared routine under row-level security", () => {
    it("hides the routine, its logs, and its cheers from a stranger", async () => {
        const { outsider } = await seedSharedRoutine();
        expect(await as(outsider, (tx) => tx.select().from(habits))).toEqual([]);
        expect(await as(outsider, (tx) => tx.select().from(habitLogs))).toEqual([]);
        expect(await as(outsider, (tx) => tx.select().from(routineCheers))).toEqual([]);
    });

    it("lets a participant read the owner's logs and write only their own", async () => {
        const { owner, participant, habitId } = await seedSharedRoutine();
        const visible = await as(participant, (tx) => tx.select().from(habitLogs));
        expect(visible).toHaveLength(1);
        expect(visible[0].userId).toBe(owner);

        await expect(
            as(participant, (tx) =>
                tx.insert(habitLogs).values({ habitId, userId: owner, status: "COMPLETED", targetDate: "2026-11-25" }),
            ),
        ).rejects.toThrow();

        const [ownLog] = await as(participant, (tx) =>
            tx
                .insert(habitLogs)
                .values({ habitId, userId: participant, status: "COMPLETED", targetDate: "2026-11-24" })
                .returning(),
        );
        expect(ownLog.userId).toBe(participant);

        await expect(
            as(participant, (tx) =>
                tx
                    .insert(habitLogs)
                    .values({ habitId, userId: participant, status: "COMPLETED", targetDate: "2026-11-24" }),
            ),
        ).rejects.toThrow();
    });

    it("blocks a supporter from inserting any log", async () => {
        const { supporter, habitId } = await seedSharedRoutine();
        await expect(
            as(supporter, (tx) =>
                tx
                    .insert(habitLogs)
                    .values({ habitId, userId: supporter, status: "COMPLETED", targetDate: "2026-11-24" }),
            ),
        ).rejects.toThrow();
    });

    it("keeps habits.user_id intact via trigger and blocks direct routine_members insert", async () => {
        const { owner, participant, habitId } = await seedSharedRoutine();
        const [updated] = await as(participant, (tx) =>
            tx.update(habits).set({ title: "Yoga", userId: participant }).where(eq(habits.id, habitId)).returning(),
        );
        expect(updated.title).toBe("Yoga");
        expect(updated.userId).toBe(owner);

        await expect(
            as(participant, (tx) => tx.insert(routineMembers).values({ habitId, userId: participant, role: "edit" })),
        ).rejects.toThrow();
    });

    it("restricts cheers to members, prevents impersonation, and shows cheers only to sender and recipient", async () => {
        const { owner, participant, supporter, outsider, habitId } = await seedSharedRoutine();

        await expect(
            as(outsider, (tx) =>
                tx.insert(routineCheers).values({
                    habitId,
                    fromUserId: outsider,
                    toUserId: owner,
                    targetDate: "2026-11-24",
                }),
            ),
        ).rejects.toThrow();

        await expect(
            as(supporter, (tx) =>
                tx.insert(routineCheers).values({
                    habitId,
                    fromUserId: participant,
                    toUserId: owner,
                    targetDate: "2026-11-24",
                }),
            ),
        ).rejects.toThrow();

        await as(supporter, (tx) =>
            tx.insert(routineCheers).values({
                habitId,
                fromUserId: supporter,
                toUserId: owner,
                targetDate: "2026-11-24",
            }),
        );
        expect(await as(supporter, (tx) => tx.select().from(routineCheers))).toHaveLength(1);
        expect(await as(owner, (tx) => tx.select().from(routineCheers))).toHaveLength(1);
        expect(await as(participant, (tx) => tx.select().from(routineCheers))).toEqual([]);
        expect(await as(outsider, (tx) => tx.select().from(routineCheers))).toEqual([]);
    });
});
