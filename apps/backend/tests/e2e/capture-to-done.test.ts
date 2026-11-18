import { beforeAll, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

beforeAll(startTestDb);

it("a thought is captured, becomes a task, gets done, and can be taken out of the way", async () => {
    const userId = await createUser();
    const inbox = apiAs(userId, "/inbox", inboxRoutes);
    const tasks = apiAs(userId, "/tasks", taskRoutes);

    const item = (await inbox("POST", "", { rawText: "renew passport" })).body.data;
    expect((await inbox("GET", "")).body.data.map((i: any) => i.id)).toEqual([item.id]);

    const task = (await inbox("POST", `/${item.id}/process`, { title: "Renew passport" })).body.data;
    expect(task).toMatchObject({ title: "Renew passport", state: "ACTIVE" });
    expect((await tasks("GET", "?state=ACTIVE")).body.data.map((t: any) => t.id)).toContain(task.id);

    await tasks("PATCH", "/batch/state", { taskIds: [task.id], state: "COMPLETE" });
    expect((await tasks("GET", `/${task.id}`)).body.data.state).toBe("COMPLETE");
    expect((await tasks("GET", "?state=ACTIVE")).body.data).toEqual([]);

    // Trash, not erase: the task is still readable until Trash is emptied.
    await tasks("PATCH", "/batch/state", { taskIds: [task.id], state: "ARCHIVED" });
    expect((await tasks("GET", `/${task.id}`)).status).toBe(200);
    expect((await tasks("DELETE", "/trash")).body.data).toEqual({ deleted: 1 });
    expect((await tasks("GET", `/${task.id}`)).status).toBe(404);
});
