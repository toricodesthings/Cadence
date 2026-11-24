import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
import { withRls } from "../../src/platform/rls";
import { assertRowRoom } from "../../src/platform/storage-ceiling";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { personalEventRoutes } from "../../src/domains/personal-events/personal-events.route";

let userId: string;
let api: ReturnType<typeof apiAs>;
let other: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser();
    api = apiAs(userId, "/personal-events", personalEventRoutes);
    other = apiAs(await createUser(), "/personal-events", personalEventRoutes);
});

describe("personal events", () => {
    it("creates, lists, patches and deletes", async () => {
        const created = await api("POST", "", { label: "Mom", monthDay: "03-14", emoji: "🎂" });
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({ label: "Mom", notify: true, startedOn: null });

        const { id } = created.body.data;
        const patched = await api("PATCH", `/${id}`, { label: "Mum", notify: false });
        expect(patched.body.data).toMatchObject({ label: "Mum", notify: false });

        expect((await api("GET", "")).body.data.map((e: any) => e.label)).toEqual(["Mum"]);
        expect((await api("DELETE", `/${id}`)).status).toBe(200);
        expect((await api("GET", "")).body.data).toEqual([]);
    });

    it("replays a client id with the same Idempotency-Key as one row", async () => {
        const id = "01970000-0000-7000-8000-000000000001";
        const body = { id, label: "Wedding", monthDay: "06-01" };
        const first = await api("POST", "", body, { "Idempotency-Key": id });
        const again = await api("POST", "", body, { "Idempotency-Key": id });
        expect(first.body.data.id).toBe(id);
        expect(again.body.data.id).toBe(id);
        expect((await api("GET", "")).body.data).toHaveLength(1);
    });

    it("rejects a bad monthDay", async () => {
        expect((await api("POST", "", { label: "x", monthDay: "13-40" })).status).toBe(400);
    });

    it("hides another person's events: 404 on write, nothing on read", async () => {
        const { id } = (await api("POST", "", { label: "Mine", monthDay: "01-02" })).body.data;
        expect((await other("PATCH", `/${id}`, { label: "x" })).status).toBe(404);
        expect((await other("DELETE", `/${id}`)).status).toBe(404);
        expect((await other("GET", "")).body.data).toEqual([]);
    });

    it("refuses a create at the abuse ceiling", async () => {
        await api("POST", "", { label: "One", monthDay: "01-02" });
        await expect(
            withRls(getTestDb(), userId, (tx) => assertRowRoom(tx, userId, "events", 1, 1)),
        ).rejects.toMatchObject({ statusCode: 413, code: "STORAGE_FULL" });
    });
});
