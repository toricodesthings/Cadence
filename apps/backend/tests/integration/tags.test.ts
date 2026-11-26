import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TAG_PALETTE } from "@cadence/contracts/constants";
import { apiAs } from "../helpers/app";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
import { withRls } from "../../src/platform/rls";
import { findOrCreateTags } from "../../src/domains/tags/tags.service";

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
    it("allows one tag per name, in any case, per person", async () => {
        const first = await api("POST", "", { name: "Work" });
        const again = await api("POST", "", { name: "work" });
        const someoneElse = await otherUser("POST", "", { name: "Work" });

        expect(first.status).toBe(201);
        expect(again.status).toBe(409);
        expect(again.body.error.message).toBe("You already have a tag with that name");
        expect(someoneElse.status).toBe(201);
    });

    it("refuses a rename onto a name already used", async () => {
        await api("POST", "", { name: "Home" });
        const errand = (await api("POST", "", { name: "Errand" })).body.data;

        const { status } = await api("PATCH", `/${errand.id}`, { name: "HOME" });

        expect(status).toBe(409);
    });

    it("finds a name made in another case instead of making a second tag", async () => {
        const userId = await createUser();
        const [made] = await withRls(getTestDb(), userId, (tx) => findOrCreateTags(tx, userId, ["Gym"]));
        const [found, fresh] = await withRls(getTestDb(), userId, (tx) => findOrCreateTags(tx, userId, ["GYM", "Run"]));

        expect(found).toBe(made);
        expect(fresh).toBeTruthy();
        const { body } = await apiAs(userId, "/tags", tagRoutes)("GET", "");
        expect(body.data).toHaveLength(2);
    });

    it("mints time-ordered UUIDv7 ids when the client sends none", async () => {
        const { body } = await api("POST", "", { name: "versioned" });

        expect(body.data.id[14]).toBe("7");
    });

    it("gives a tag with no colour a random palette colour", async () => {
        const { status, body } = await api("POST", "", { name: "urgent" });

        expect(status).toBe(201);
        expect(TAG_PALETTE.slice(1)).toContain(body.data.color);
    });

    it("colours tags made by name from the palette", async () => {
        const userId = await createUser();
        await withRls(getTestDb(), userId, (tx) => findOrCreateTags(tx, userId, ["fresh"]));

        const { body } = await apiAs(userId, "/tags", tagRoutes)("GET", "");

        expect(TAG_PALETTE.slice(1)).toContain(body.data[0].color);
    });

    it("keeps a colour the caller chose, even the grey default", async () => {
        const { body } = await api("POST", "", { name: "plain", color: "default" });

        expect(body.data.color).toBe("default");
    });

    it("lists only the caller's tags", async () => {
        await api("POST", "", { name: "work" });
        await api("POST", "", { name: "home", color: "#7ee787" });
        await otherUser("POST", "", { name: "secret" });

        const { body } = await api("GET", "");

        expect(body.data.map((t: any) => t.name)).toEqual(["work", "home"]);
    });

    it("puts new tags last, in the person's own order", async () => {
        await api("POST", "", { name: "zeta" });
        await api("POST", "", { name: "alpha" });

        const { body } = await api("GET", "");

        expect(body.data.map((t: any) => t.name)).toEqual(["zeta", "alpha"]);
    });

    it("moves a tag by its sort order", async () => {
        const { body: a } = await api("POST", "", { name: "a" });
        const { body: b } = await api("POST", "", { name: "b" });

        const { status, body } = await api("PATCH", `/${b.data.id}`, { sortOrder: a.data.sortOrder - 1 });

        expect(status).toBe(200);
        expect(body.data.sortOrder).toBe(a.data.sortOrder - 1);
        expect((await api("GET", "")).body.data.map((t: any) => t.name)).toEqual(["b", "a"]);
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
