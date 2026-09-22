import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { tagRoutes } from "../../src/domains/tags/tags.route";

let api: ReturnType<typeof apiAs>;
let otherUser: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    api = apiAs(await createUser(), "/tags", tagRoutes);
    otherUser = apiAs(await createUser(), "/tags", tagRoutes);
});

describe("tags", () => {
    it("creates a tag, letting the DB default the colour", async () => {
        const { status, body } = await api("POST", "", { name: "urgent" });

        expect(status).toBe(201);
        expect(body.data).toMatchObject({ name: "urgent", color: "default" });
    });

    it("rejects an invalid body with 400", async () => {
        expect((await api("POST", "", { name: "" })).status).toBe(400);
    });

    it("lists only the caller's tags, ordered by name", async () => {
        await api("POST", "", { name: "work" });
        await api("POST", "", { name: "home", color: "#7ee787" });
        await otherUser("POST", "", { name: "secret" });

        const { body } = await api("GET", "");

        expect(body.data.map((t: any) => t.name)).toEqual(["home", "work"]);
    });

    it("renames a tag without touching its colour", async () => {
        const { body: created } = await api("POST", "", { name: "old", color: "#ff7b72" });

        const { status, body } = await api("PATCH", `/${created.data.id}`, { name: "new" });

        expect(status).toBe(200);
        expect(body.data).toMatchObject({ name: "new", color: "#ff7b72" });
    });

    it("deletes a tag", async () => {
        const { body: created } = await api("POST", "", { name: "gone" });

        expect((await api("DELETE", `/${created.data.id}`)).status).toBe(200);
        expect((await api("GET", `/${created.data.id}`)).status).toBe(404);
    });

    it("rejects a non-uuid id with 400", async () => {
        expect((await api("GET", "/not-a-uuid")).status).toBe(400);
    });

    it("treats another user's tag as not found for read, update, and delete, and leaves it intact", async () => {
        const { body: theirs } = await otherUser("POST", "", { name: "theirs" });
        const id = theirs.data.id;

        expect((await api("GET", `/${id}`)).status).toBe(404);
        expect((await api("PATCH", `/${id}`, { name: "hijacked" })).status).toBe(404);
        expect((await api("DELETE", `/${id}`)).status).toBe(404);
        expect((await otherUser("GET", `/${id}`)).body.data.name).toBe("theirs");
    });

    it("replays a retried create with the same Idempotency-Key instead of duplicating it", async () => {
        const headers = { "Idempotency-Key": "tag-create-1" };

        const first = await api("POST", "", { name: "once" }, headers);
        const retry = await api("POST", "", { name: "once" }, headers);

        expect(retry.body.data.id).toBe(first.body.data.id);
        expect((await api("GET", "")).body.data).toHaveLength(1);
    });
});
