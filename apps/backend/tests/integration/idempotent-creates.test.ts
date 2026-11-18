import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";
import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

beforeAll(startTestDb);

/** A retried create (flaky network, offline queue replay) must never make a second row. */
describe("a retried create under one Idempotency-Key", () => {
    it.each([
        ["list", "/projects", projectRoutes, { name: "Home" }, "GET", ""],
        ["section", "/sections", sectionRoutes, { name: "Later", orderIndex: 1 }, "GET", ""],
    ] as const)("makes one %s", async (_what, mount, router, body, _m, listPath) => {
        const api = apiAs(await createUser(), mount, router as any);
        const headers = { "Idempotency-Key": crypto.randomUUID() };

        const first = await api("POST", "", body, headers);
        const retry = await api("POST", "", body, headers);

        expect(first.status).toBe(201);
        expect(retry.body.data.id).toBe(first.body.data.id);
        expect((await api("GET", listPath)).body.data).toHaveLength(1);
    });

    it("makes one step", async () => {
        const userId = await createUser();
        const tasks = apiAs(userId, "/tasks", taskRoutes);
        const api = apiAs(userId, "", subtaskRoutes);
        const task = (await tasks("POST", "", { title: "T", orderIndex: 1 })).body.data;
        const headers = { "Idempotency-Key": crypto.randomUUID() };

        const first = await api("POST", `/tasks/${task.id}/subtasks`, { title: "step", orderIndex: 1 }, headers);
        const retry = await api("POST", `/tasks/${task.id}/subtasks`, { title: "step", orderIndex: 1 }, headers);

        expect(retry.body.data.id).toBe(first.body.data.id);
        expect((await api("GET", `/tasks/${task.id}/subtasks`)).body.data).toHaveLength(1);
    });

    it("answers a replay with the first result, whatever the new body says, and stores one row", async () => {
        const api = apiAs(await createUser(), "/tasks", taskRoutes);
        const headers = { "Idempotency-Key": crypto.randomUUID() };

        const first = await api("POST", "", { title: "First", orderIndex: 1 }, headers);
        const replay = await api("POST", "", { title: "A different body", orderIndex: 2 }, headers);

        expect(replay.status).toBe(first.status);
        expect(replay.body.data).toMatchObject({ id: first.body.data.id, title: "First" });
        expect((await api("GET", "?state=ACTIVE")).body.data).toHaveLength(1);
    });

    it("lets a repeated PATCH land on the same state without a key", async () => {
        const api = apiAs(await createUser(), "/tasks", taskRoutes);
        const task = (await api("POST", "", { title: "T", orderIndex: 1 })).body.data;

        const once = await api("PATCH", `/${task.id}`, { title: "Renamed", priority: 2 });
        const twice = await api("PATCH", `/${task.id}`, { title: "Renamed", priority: 2 });

        expect(twice.status).toBe(200);
        expect(twice.body.data).toMatchObject({ title: "Renamed", priority: 2 });
        expect(once.body.data.id).toBe(twice.body.data.id);
    });

    it("never answers one person with another's earlier result for the same key", async () => {
        const key = { "Idempotency-Key": "shared-key-from-two-clients" };
        const [a, b] = [
            apiAs(await createUser(), "/projects", projectRoutes),
            apiAs(await createUser(), "/projects", projectRoutes),
        ];

        const mine = await a("POST", "", { name: "A's list" }, key);
        const theirs = await b("POST", "", { name: "B's list" }, key);

        expect(theirs.body.data.id).not.toBe(mine.body.data.id);
        expect(theirs.body.data.name).toBe("B's list");
        expect((await b("GET", "")).body.data.map((p: any) => p.name)).toEqual(["B's list"]);
    });
});

describe("someone else's ids in a bulk body", () => {
    it("tag linking changes none of another person's tasks", async () => {
        const [mineId, theirId] = [await createUser(), await createUser()];
        const [tags, theirTasks] = [apiAs(mineId, "/tags", tagRoutes), apiAs(theirId, "/tasks", taskRoutes)];
        const tag = (await tags("POST", "", { name: "mine" })).body.data;
        const theirs = (await theirTasks("POST", "", { title: "Theirs", orderIndex: 1 })).body.data;

        const res = await tags("POST", `/${tag.id}/tasks`, { taskIds: [theirs.id], linked: true });

        expect(res.status === 404 || res.body.data?.taskIds?.length === 0, JSON.stringify(res.body)).toBe(true);
        expect((await theirTasks("GET", `/${theirs.id}/tags`)).body.data).toEqual([]);
    });

    it("the step list for another person's task is empty, not their steps", async () => {
        const [mineId, theirId] = [await createUser(), await createUser()];
        const [theirTasks, theirSteps] = [apiAs(theirId, "/tasks", taskRoutes), apiAs(theirId, "", subtaskRoutes)];
        const mineSteps = apiAs(mineId, "", subtaskRoutes);
        const theirs = (await theirTasks("POST", "", { title: "Theirs", orderIndex: 1 })).body.data;
        await theirSteps("POST", `/tasks/${theirs.id}/subtasks`, { title: "secret step", orderIndex: 1 });

        const bulk = await mineSteps("POST", "/subtasks/bulk", { taskIds: [theirs.id] });
        const byQuery = await mineSteps("GET", `/subtasks?taskIds=${theirs.id}`);

        for (const res of [bulk, byQuery]) {
            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).not.toContain("secret step");
        }
        expect(
            (await mineSteps("POST", `/tasks/${theirs.id}/subtasks`, { title: "mine now", orderIndex: 1 })).status,
        ).toBe(404);
    });

    it("refuses a tag-linking body of 501 tasks and a step lookup of 201", async () => {
        const userId = await createUser();
        const tags = apiAs(userId, "/tags", tagRoutes);
        const steps = apiAs(userId, "", subtaskRoutes);
        const tag = (await tags("POST", "", { name: "t" })).body.data;
        const ids = (n: number) => Array.from({ length: n }, () => crypto.randomUUID());

        expect((await tags("POST", `/${tag.id}/tasks`, { taskIds: ids(501), linked: true })).status).toBe(400);
        expect((await tags("POST", `/${tag.id}/tasks`, { taskIds: [], linked: true })).status).toBe(400);
        expect((await steps("POST", "/subtasks/bulk", { taskIds: ids(201) })).status).toBe(400);
    });
});
