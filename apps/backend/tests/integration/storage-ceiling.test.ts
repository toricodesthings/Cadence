import { beforeAll, describe, expect, it, vi } from "vitest";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { withRls } from "../../src/platform/rls";
import { assertRowRoom, assertStorageRoom, LARGE_TEXT_CHARS } from "../../src/platform/storage-ceiling";
import { apiAs } from "../helpers/app";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

beforeAll(startTestDb);

const asUser = <T>(userId: string, fn: (tx: any) => Promise<T>) => withRls(getTestDb(), userId, fn);

describe("storage ceilings", () => {
    it("refuses a new row past the kind's ceiling, counting only this account", async () => {
        const userId = await createUser();
        const other = await createUser();
        await asOwner((pg) => pg.query("INSERT INTO tasks (user_id, title, order_index) VALUES ($1, 'a', 0), ($1, 'b', 1), ($2, 'c', 0)", [userId, other]));

        await expect(asUser(userId, (tx) => assertRowRoom(tx, userId, "tasks", 1, 3))).resolves.toBeUndefined();
        await expect(asUser(userId, (tx) => assertRowRoom(tx, userId, "tasks", 1, 2))).rejects.toMatchObject({ statusCode: 413, code: "STORAGE_FULL" });
        await expect(asUser(other, (tx) => assertRowRoom(tx, other, "tasks", 1, 2))).resolves.toBeUndefined();
    });

    it("checks the text ceiling only for a large write, then sums descriptions and notes", async () => {
        const userId = await createUser();
        const big = "x".repeat(LARGE_TEXT_CHARS + 1);
        await asOwner((pg) => pg.query("INSERT INTO tasks (user_id, title, content, order_index) VALUES ($1, 'a', $2, 0)", [userId, big]));

        await expect(asUser(userId, (tx) => assertStorageRoom(tx, userId, ["small"], 10))).resolves.toBeUndefined();
        await expect(asUser(userId, (tx) => assertStorageRoom(tx, userId, [big], 10))).rejects.toMatchObject({ statusCode: 413, code: "STORAGE_FULL" });
        await expect(asUser(userId, (tx) => assertStorageRoom(tx, userId, [big]))).resolves.toBeUndefined();
    });

    it("leaves everyday creates alone", async () => {
        const userId = await createUser();
        const { status } = await apiAs(userId, "/tasks", taskRoutes)("POST", "", { title: "Buy milk", orderIndex: 1 });
        expect(status).toBe(201);
    });
});
