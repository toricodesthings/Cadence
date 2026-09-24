import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

const MISSING_ID = "99999999-9999-4999-8999-999999999999";

let api: ReturnType<typeof apiAs>;
let tasks: ReturnType<typeof apiAs>;
let otherApi: ReturnType<typeof apiAs>;
let otherTasks: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUser();
    const otherId = await createUser();
    api = apiAs(userId, "/api", subtaskRoutes);
    tasks = apiAs(userId, "/tasks", taskRoutes);
    otherApi = apiAs(otherId, "/api", subtaskRoutes);
    otherTasks = apiAs(otherId, "/tasks", taskRoutes);
});

async function newTask(client = tasks) {
    const { body } = await client("POST", "", { title: "Parent", orderIndex: 1 });
    return body.data.id as string;
}

describe("subtasks under a task", () => {
    it("creates subtasks and lists them in orderIndex order", async () => {
        const taskId = await newTask();
        await api("POST", `/tasks/${taskId}/subtasks`, { title: "second", orderIndex: 2 });
        await api("POST", `/tasks/${taskId}/subtasks`, { title: "first", orderIndex: 1 });

        const { status, body } = await api("GET", `/tasks/${taskId}/subtasks`);

        expect(status).toBe(200);
        expect(body.data.map((s: any) => [s.title, s.isComplete])).toEqual([["first", false], ["second", false]]);
    });

    it("rejects an invalid body with 400", async () => {
        expect((await api("POST", `/tasks/${await newTask()}/subtasks`, { title: "no order" })).status).toBe(400);
    });

    it.each([
        ["a task that does not exist", async () => MISSING_ID],
        ["another user's task", async () => newTask(otherTasks)],
    ])("treats %s as not found for create and list", async (_label, parent) => {
        const taskId = await parent();

        expect((await api("POST", `/tasks/${taskId}/subtasks`, { title: "x", orderIndex: 0 })).status).toBe(404);
        expect((await api("GET", `/tasks/${taskId}/subtasks`)).status).toBe(404);
    });

    it("deletes a task's subtasks when the task is deleted", async () => {
        const taskId = await newTask();
        const { body: sub } = await api("POST", `/tasks/${taskId}/subtasks`, { title: "x", orderIndex: 0 });

        expect((await tasks("DELETE", `/${taskId}`)).status).toBe(200);
        expect((await api("PATCH", `/subtasks/${sub.data.id}`, { isComplete: true })).status).toBe(404);
    });
});

describe("bulk subtask read", () => {
    it("groups subtasks per requested task, with an empty list for tasks that have none", async () => {
        const [a, b] = [await newTask(), await newTask()];
        await api("POST", `/tasks/${a}/subtasks`, { title: "a2", orderIndex: 2 });
        await api("POST", `/tasks/${a}/subtasks`, { title: "a1", orderIndex: 1 });

        const { body } = await api("GET", `/subtasks?taskIds=${[a, b, a].join(",")}`);

        expect(Object.keys(body.data).sort()).toEqual([a, b].sort());
        expect(body.data[a].map((s: any) => s.title)).toEqual(["a1", "a2"]);
        expect(body.data[b]).toEqual([]);
    });

    it("never returns another user's subtasks", async () => {
        const theirs = await newTask(otherTasks);
        await otherApi("POST", `/tasks/${theirs}/subtasks`, { title: "private", orderIndex: 0 });

        expect((await api("GET", `/subtasks?taskIds=${theirs}`)).body.data).toEqual({ [theirs]: [] });
    });

    it("answers an empty request with an empty map", async () => {
        expect((await api("GET", "/subtasks?taskIds=")).body.data).toEqual({});
    });

    it("rejects malformed task ids with 400", async () => {
        expect((await api("GET", "/subtasks?taskIds=not-a-uuid")).status).toBe(400);
    });

    it("still answers the POST older desktop builds send", async () => {
        const task = await newTask();
        expect((await api("POST", "/subtasks/bulk", { taskIds: [task] })).body.data).toEqual({ [task]: [] });
    });
});

describe("changing a subtask", () => {
    it("updates only the sent fields", async () => {
        const taskId = await newTask();
        const { body: sub } = await api("POST", `/tasks/${taskId}/subtasks`, { title: "Draft", orderIndex: 3 });

        const { body } = await api("PATCH", `/subtasks/${sub.data.id}`, { isComplete: true });

        expect(body.data).toMatchObject({ title: "Draft", orderIndex: 3, isComplete: true });
    });

    it("reorders a subtask and requires the new orderIndex", async () => {
        const taskId = await newTask();
        const { body: sub } = await api("POST", `/tasks/${taskId}/subtasks`, { title: "x", orderIndex: 0 });

        expect((await api("PATCH", `/subtasks/${sub.data.id}/reorder`, { orderIndex: 7 })).body.data.orderIndex).toBe(7);
        expect((await api("PATCH", `/subtasks/${sub.data.id}/reorder`, {})).status).toBe(400);
    });

    it("deletes a subtask", async () => {
        const taskId = await newTask();
        const { body: sub } = await api("POST", `/tasks/${taskId}/subtasks`, { title: "x", orderIndex: 0 });

        expect((await api("DELETE", `/subtasks/${sub.data.id}`)).status).toBe(200);
        expect((await api("GET", `/tasks/${taskId}/subtasks`)).body.data).toEqual([]);
    });

    it("treats another user's subtask as not found for update, reorder, and delete, and leaves it intact", async () => {
        const theirs = await newTask(otherTasks);
        const { body: sub } = await otherApi("POST", `/tasks/${theirs}/subtasks`, { title: "theirs", orderIndex: 0 });
        const id = sub.data.id;

        expect((await api("PATCH", `/subtasks/${id}`, { title: "hijacked" })).status).toBe(404);
        expect((await api("PATCH", `/subtasks/${id}/reorder`, { orderIndex: 9 })).status).toBe(404);
        expect((await api("DELETE", `/subtasks/${id}`)).status).toBe(404);
        expect((await otherApi("GET", `/tasks/${theirs}/subtasks`)).body.data.map((s: any) => s.title)).toEqual(["theirs"]);
    });
});
