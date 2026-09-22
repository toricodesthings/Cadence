import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { noteRoutes } from "../../src/domains/notes/notes.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

let notes: ReturnType<typeof apiAs>;
let tasks: ReturnType<typeof apiAs>;
let otherNotes: ReturnType<typeof apiAs>;
let otherTasks: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUser();
    const otherId = await createUser();
    notes = apiAs(userId, "/api", noteRoutes);
    tasks = apiAs(userId, "/tasks", taskRoutes);
    otherNotes = apiAs(otherId, "/api", noteRoutes);
    otherTasks = apiAs(otherId, "/tasks", taskRoutes);
});

async function newTask(client = tasks) {
    return (await client("POST", "", { title: "T", orderIndex: 1 })).body.data.id as string;
}

describe("task notes", () => {
    it("answers null before a note exists, then creates one with derived stats", async () => {
        const taskId = await newTask();
        expect((await notes("GET", `/tasks/${taskId}/note`)).body.data).toBeNull();

        const { status, body } = await notes("PATCH", `/tasks/${taskId}/note`, { body: "# Plan\n\nShip the thing" });

        expect(status).toBe(200);
        expect(body.data).toMatchObject({ body: "# Plan\n\nShip the thing", excerpt: "Plan Ship the thing", wordCount: 5, headingCount: 1, version: 1 });
        expect((await notes("GET", `/tasks/${taskId}/note`)).body.data.id).toBe(body.data.id);
    });

    it("updates the same note in place, bumping its version", async () => {
        const taskId = await newTask();
        const { body: first } = await notes("PATCH", `/tasks/${taskId}/note`, { body: "v1" });

        const { body: second } = await notes("PATCH", `/tasks/${taskId}/note`, { body: "v2 text" });

        expect(second.data).toMatchObject({ id: first.data.id, body: "v2 text", version: 2, wordCount: 2 });
    });

    it("accepts the updatedAt it served, and rejects a stale one with 409 without saving", async () => {
        const taskId = await newTask();
        await notes("PATCH", `/tasks/${taskId}/note`, { body: "v1" });
        const { body: served } = await notes("GET", `/tasks/${taskId}/note`);

        expect((await notes("PATCH", `/tasks/${taskId}/note`, { body: "v2", expectedUpdatedAt: served.data.updatedAt })).status).toBe(200);
        expect((await notes("PATCH", `/tasks/${taskId}/note`, { body: "v3", expectedUpdatedAt: served.data.updatedAt })).status).toBe(409);
        expect((await notes("GET", `/tasks/${taskId}/note`)).body.data.body).toBe("v2");
    });

    it("deletes the note with its task", async () => {
        const taskId = await newTask();
        await notes("PATCH", `/tasks/${taskId}/note`, { body: "gone" });

        await tasks("DELETE", `/${taskId}`);

        expect((await notes("GET", `/tasks/${taskId}/note`)).status).toBe(404);
    });

    it("rejects a note over 50k characters", async () => {
        expect((await notes("PATCH", `/tasks/${await newTask()}/note`, { body: "x".repeat(50_001) })).status).toBe(400);
    });

    it("treats another user's task as not found for read and write, and leaves their note intact", async () => {
        const theirs = await newTask(otherTasks);
        await otherNotes("PATCH", `/tasks/${theirs}/note`, { body: "private" });

        expect((await notes("GET", `/tasks/${theirs}/note`)).status).toBe(404);
        expect((await notes("PATCH", `/tasks/${theirs}/note`, { body: "overwritten" })).status).toBe(404);
        expect((await otherNotes("GET", `/tasks/${theirs}/note`)).body.data.body).toBe("private");
    });
});
