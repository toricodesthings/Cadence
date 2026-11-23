import { beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { projectRoutes } from "../../src/domains/projects/projects.route";
import { replanAfterWrites } from "../../src/domains/push/reminder-clock";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

beforeAll(startTestDb);

type Event = { to: string; kind: "replan" | "ping"; origin?: string; changes?: any[] };

async function house() {
    const [ownerId, editorId, viewerId] = await Promise.all([1, 2, 3].map(() => createUser()));
    const owner = {
        tasks: apiAs(ownerId, "/tasks", taskRoutes),
        lists: apiAs(ownerId, "/lists", sharingRoutes),
        projects: apiAs(ownerId, "/projects", projectRoutes),
    };
    const list = (await owner.projects("POST", "", { name: "Our House" })).body.data;
    const task = (await owner.tasks("POST", "", { title: "Paint", orderIndex: 1, projectId: list.id })).body.data;
    const tag = (await apiAs(ownerId, "/tags", tagRoutes)("POST", "", { name: "home" })).body.data;
    await owner.tasks("POST", `/${task.id}/tags`, { tagId: tag.id });
    for (const [id, role] of [
        [editorId, "edit"],
        [viewerId, "view"],
    ] as const) {
        const url = (await owner.lists("POST", `/${list.id}/invites`)).body.data.url;
        await apiAs(id, "/lists", sharingRoutes)("POST", "/join", { token: tokenOf(url) });
        if (role === "edit") await owner.lists("PATCH", `/${list.id}/members/${id}`, { role });
    }
    return { ownerId, editorId, viewerId, list, task, tag };
}

describe("who hears of a write", () => {
    it("tells the owner and every other member, not the writer's own copy, and shapes each row per person", async () => {
        const { ownerId, editorId, viewerId, task, tag } = await house();
        const viewerTag = (await apiAs(viewerId, "/tags", tagRoutes)("POST", "", { name: "mine" })).body.data;
        await apiAs(viewerId, "/tasks", taskRoutes)("POST", `/${task.id}/tags`, { tagId: viewerTag.id });
        const events: Event[] = [];
        const editor = liveAsWithMiddleware(editorId, events);
        const res = await editor("PATCH", `/tasks/${task.id}`, { title: "Paint it blue" });
        expect(res.status).toBe(200);

        const byRecipient = Object.fromEntries(events.map((event) => [event.to, event]));
        expect(Object.keys(byRecipient).sort()).toEqual([editorId, ownerId, viewerId].sort());
        // The writer's own other devices: the row, no tags (the owner's), and the writing tab is named so it isn't pinged.
        expect(byRecipient[editorId]).toMatchObject({ kind: "replan", origin: "tab-1" });
        expect(byRecipient[editorId].changes?.[0]).toMatchObject({
            type: "task",
            task: { id: task.id, title: "Paint it blue", tagIds: [] },
        });
        // The owner: their clock replans (reminders may have changed) and the row carries their tags.
        expect(byRecipient[ownerId]).toMatchObject({ kind: "replan" });
        expect(byRecipient[ownerId].changes?.[0].task).toMatchObject({
            title: "Paint it blue",
            tagIds: [tag.id],
            updatedBy: editorId,
        });
        // Another member: a ping with the row carrying only their own tags, never the owner's.
        expect(byRecipient[viewerId]).toMatchObject({ kind: "ping" });
        expect(byRecipient[viewerId].changes?.[0].task).toMatchObject({
            title: "Paint it blue",
            tagIds: [viewerTag.id],
        });
    });

    it("pings the whole audience, the removed person included, when someone is removed", async () => {
        const { ownerId, editorId, viewerId, list } = await house();
        const events: Event[] = [];
        const owner = liveAsWithMiddleware(ownerId, events);
        expect((await owner("DELETE", `/lists/${list.id}/members/${viewerId}`)).status).toBe(200);
        expect(events.map((event) => event.to).sort()).toEqual([editorId, ownerId, viewerId].sort());
        for (const event of events) expect(event.changes).toEqual([{ type: "list", listId: list.id }]);
    });

    it("sends an own, unshared list's write only to the person's own copies", async () => {
        const { ownerId } = await house();
        const events: Event[] = [];
        const owner = liveAsWithMiddleware(ownerId, events);
        const made = await owner("POST", "/tasks", { title: "Alone", orderIndex: 1 });
        expect(events.map((event) => event.to)).toEqual([ownerId]);
        expect(events[0].changes?.[0]).toMatchObject({ type: "task", task: { id: made.body.data.id } });
    });
});

/** One person's client over every route that matters, with the live middleware as in `index.ts`. */
function liveAsWithMiddleware(userId: string, events: Event[]) {
    const clocks = {
        idFromName: (name: string) => name,
        get: (to: string) => ({
            replan: async (_: string, __: unknown, how: any) => void events.push({ to, kind: "replan", ...how }),
            ping: async (origin?: string, changes?: any[]) => void events.push({ to, kind: "ping", origin, changes }),
        }),
    };
    const api = new Hono<any>()
        .use("*", async (c, next) => {
            c.set("userId", userId);
            await next();
        })
        .use("/api/v1/*", replanAfterWrites as never)
        .route("/api/v1/tasks", taskRoutes)
        .route("/api/v1/lists", sharingRoutes);
    return async (method: string, url: string, body?: unknown) => {
        const pending: Promise<unknown>[] = [];
        const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
        const res = await api.request(
            `http://localhost/api/v1${url}`,
            {
                method,
                headers: { "content-type": "application/json", "X-Cadence-Origin": "tab-1" },
                body: body === undefined ? undefined : JSON.stringify(body),
            },
            { REMINDER_CLOCK: clocks },
            ctx as never,
        );
        await Promise.all(pending);
        return { status: res.status, body: (await res.json()) as any };
    };
}
