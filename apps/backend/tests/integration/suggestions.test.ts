import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { suggestionRoutes } from "../../src/domains/suggestions/suggestions.route";

let userId: string;
let api: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser();
    api = apiAs(userId, "/suggestions", suggestionRoutes);
});

/** Suggestions are system-generated (no create route), so seed them directly. */
async function seed(owner: string, title: string, status = "PENDING") {
    return asOwner(async (pg) =>
        (await pg.query<{ id: string }>("INSERT INTO suggestions (user_id, type, title, status) VALUES ($1, 'move_overdue', $2, $3) RETURNING id", [owner, title, status])).rows[0].id,
    );
}

describe("suggestions", () => {
    it("lists only the caller's pending suggestions", async () => {
        await seed(userId, "Pending");
        await seed(userId, "Handled", "ACCEPTED");
        await seed(await createUser(), "Theirs");

        const { body } = await api("GET", "");

        expect(body.data.map((s: any) => s.title)).toEqual(["Pending"]);
    });

    it.each(["ACCEPTED", "DISMISSED"])("resolves a suggestion as %s, stamps resolvedAt, and drops it from the list", async (status) => {
        const id = await seed(userId, "S");

        const { status: code, body } = await api("PATCH", `/${id}`, { status });

        expect(code).toBe(200);
        expect(body.data.status).toBe(status);
        expect(body.data.resolvedAt).not.toBeNull();
        expect((await api("GET", "")).body.data).toEqual([]);
    });

    it.each([
        ["an unknown status", { status: "INVALID_STATUS" }],
        ["a missing status", {}],
    ])("rejects %s with 400", async (_label, body) => {
        expect((await api("PATCH", `/${await seed(userId, "S")}`, body)).status).toBe(400);
    });

    it("rejects a non-uuid id with 400", async () => {
        expect((await api("PATCH", "/not-a-uuid", { status: "ACCEPTED" })).status).toBe(400);
    });

    it("treats another user's suggestion as not found and leaves it pending", async () => {
        const otherId = await createUser();
        const theirs = await seed(otherId, "Theirs");

        expect((await api("PATCH", `/${theirs}`, { status: "DISMISSED" })).status).toBe(404);
        expect((await apiAs(otherId, "/suggestions", suggestionRoutes)("GET", "")).body.data.map((s: any) => s.title)).toEqual(["Theirs"]);
    });
});
