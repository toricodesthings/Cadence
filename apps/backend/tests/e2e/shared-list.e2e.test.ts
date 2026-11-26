import { beforeAll, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

beforeAll(startTestDb);

it("a list is shared by link, worked on together, and left", async () => {
    const [aId, bId] = [await createUser({ name: "Ada" }), await createUser({ name: "Ben" })];
    const a = {
        projects: apiAs(aId, "/projects", projectRoutes),
        tasks: apiAs(aId, "/tasks", taskRoutes),
        lists: apiAs(aId, "/lists", sharingRoutes),
    };
    const b = {
        projects: apiAs(bId, "/projects", projectRoutes),
        tasks: apiAs(bId, "/tasks", taskRoutes),
        lists: apiAs(bId, "/lists", sharingRoutes),
    };

    const list = (await a.projects("POST", "", { name: "Our House" })).body.data;
    const token = tokenOf((await a.lists("POST", `/${list.id}/invites`)).body.data.url);
    expect((await b.lists("GET", `/invite-preview?token=${token}`)).body.data).toMatchObject({
        name: "Our House",
        ownerName: "Ada",
    });
    expect((await b.lists("POST", "/join", { token })).body.data.listId).toBe(list.id);

    expect((await b.projects("GET", "")).body.data).toMatchObject([{ id: list.id, access: "view" }]);
    expect((await b.tasks("POST", "", { title: "Buy milk", orderIndex: 1, projectId: list.id })).status).toBe(403);

    await a.lists("PATCH", `/${list.id}/members/${bId}`, { role: "edit" });
    const made = (
        await b.tasks("POST", "", { title: "Buy milk", orderIndex: 1, projectId: list.id, dueDate: "2030-03-04" })
    ).body.data;
    const read = (await a.tasks("GET", `/${made.id}`)).body.data;
    expect(read).toMatchObject({ title: "Buy milk", createdBy: bId, userId: aId });
    expect((await a.tasks("GET", "?from=2030-03-04&to=2030-03-04")).body.data.map((t: any) => t.id)).toEqual([made.id]);

    expect((await b.lists("DELETE", `/${list.id}/members/${bId}`)).status).toBe(200);
    expect((await b.projects("GET", "")).body.data).toEqual([]);
    expect((await b.tasks("GET", `/${made.id}`)).status).toBe(404);
});

it("someone with no account opens the link, makes one, and joins that same list", async () => {
    const adaId = await createUser({ name: "Ada" });
    const list = (await apiAs(adaId, "/projects", projectRoutes)("POST", "", { name: "Our House" })).body.data;
    const token = tokenOf((await apiAs(adaId, "/lists", sharingRoutes)("POST", `/${list.id}/invites`)).body.data.url);

    const cyd = apiAs(await createUser({ name: "Cyd" }), "/lists", sharingRoutes);
    expect((await cyd("GET", `/invite-preview?token=${token}`)).body.data).toMatchObject({
        kind: "list",
        name: "Our House",
    });
    expect((await cyd("POST", "/join", { token })).body.data).toEqual({ kind: "list", listId: list.id });
});
