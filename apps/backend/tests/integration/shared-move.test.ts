import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { noteRoutes } from "../../src/domains/notes/notes.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";
import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

beforeAll(startTestDb);

const clients = (userId: string) => ({
    projects: apiAs(userId, "/projects", projectRoutes),
    tasks: apiAs(userId, "/tasks", taskRoutes),
    inbox: apiAs(userId, "/inbox", inboxRoutes),
    tags: apiAs(userId, "/tags", tagRoutes),
    notes: apiAs(userId, "", noteRoutes),
    steps: apiAs(userId, "", subtaskRoutes),
    lists: apiAs(userId, "/lists", sharingRoutes),
});

async function sharedSetup() {
    const [ownerId, editorId, viewerId] = await Promise.all([createUser(), createUser(), createUser()]);
    const owner = clients(ownerId);
    const list = (await owner.projects("POST", "", { name: "Shared Home" })).body.data;
    for (const [id, role] of [
        [editorId, "edit"],
        [viewerId, "view"],
    ] as const) {
        const url = (await owner.lists("POST", `/${list.id}/invites`)).body.data.url;
        await clients(id).lists("POST", "/join", { token: tokenOf(url) });
        if (role === "edit") await owner.lists("PATCH", `/${list.id}/members/${id}`, { role });
    }
    return { ownerId, editorId, viewerId, list, owner, editor: clients(editorId), viewer: clients(viewerId) };
}

describe("moving tasks into a shared list", () => {
    it("re-owns task, subtasks, and note to the list owner, keeps caller reminder personal, and drops learning rows", async () => {
        const { ownerId, editorId, list, owner, editor } = await sharedSetup();

        const personal = (
            await editor.tasks("POST", "", {
                title: "Fix porch light",
                orderIndex: 1,
                reminderAt: "2027-03-01T14:00:00Z",
            })
        ).body.data;
        await editor.steps("POST", `/tasks/${personal.id}/subtasks`, { title: "Buy LED bulb", orderIndex: 0 });
        await editor.notes("PATCH", `/tasks/${personal.id}/note`, { body: "Needs warm 2700K bulb" });

        await asOwner(async (pg) => {
            await pg.query("INSERT INTO task_metrics (task_id, user_id, reschedule_count) VALUES ($1, $2, 2)", [
                personal.id,
                editorId,
            ]);
            await pg.query(
                "INSERT INTO task_nlp_metadata (task_id, user_id, raw_input, cleaned_title, parser_version) VALUES ($1, $2, 'Fix porch light', 'Fix porch light', 'test')",
                [personal.id, editorId],
            );
        });

        const moved = await editor.tasks("PATCH", `/${personal.id}`, { projectId: list.id });
        expect(moved.status).toBe(200);
        expect(moved.body.data).toMatchObject({
            id: personal.id,
            userId: ownerId,
            projectId: list.id,
            createdBy: editorId,
            reminderAt: "2027-03-01T14:00:00.000Z",
        });

        const ownerTasks = (await owner.tasks("GET", `?projectId=${list.id}`)).body.data;
        const found = ownerTasks.find((t: { id: string }) => t.id === personal.id);
        expect(found).toMatchObject({ id: personal.id, userId: ownerId, reminderAt: null });

        const ownerSteps = (await owner.steps("GET", `/tasks/${personal.id}/subtasks`)).body.data;
        expect(ownerSteps).toHaveLength(1);
        expect(ownerSteps[0]).toMatchObject({ title: "Buy LED bulb", userId: ownerId });

        const ownerNote = (await owner.notes("GET", `/tasks/${personal.id}/note`)).body.data;
        expect(ownerNote).toMatchObject({ body: "Needs warm 2700K bulb", userId: ownerId });

        const [metrics, nlp] = await asOwner((pg) =>
            Promise.all([
                pg.query("SELECT id FROM task_metrics WHERE task_id = $1", [personal.id]),
                pg.query("SELECT id FROM task_nlp_metadata WHERE task_id = $1", [personal.id]),
            ]),
        );
        expect(metrics.rows).toHaveLength(0);
        expect(nlp.rows).toHaveLength(0);
    });

    it("refuses a viewer moving their task into a shared list", async () => {
        const { list, viewer } = await sharedSetup();
        const personal = (await viewer.tasks("POST", "", { title: "Secret task", orderIndex: 1 })).body.data;
        const res = await viewer.tasks("PATCH", `/${personal.id}`, { projectId: list.id });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("VIEW_ONLY");
    });

    it("drops owner learning rows when moving an unshared task into their own shared list", async () => {
        const { ownerId, list, owner } = await sharedSetup();
        const personal = (await owner.tasks("POST", "", { title: "Own task", orderIndex: 1 })).body.data;
        await asOwner((pg) =>
            pg.query("INSERT INTO task_metrics (task_id, user_id, reschedule_count) VALUES ($1, $2, 1)", [
                personal.id,
                ownerId,
            ]),
        );
        const res = await owner.tasks("PATCH", `/${personal.id}`, { projectId: list.id });
        expect(res.status).toBe(200);
        const metrics = await asOwner((pg) =>
            pg.query("SELECT id FROM task_metrics WHERE task_id = $1", [personal.id]),
        );
        expect(metrics.rows).toHaveLength(0);
    });

    it("accepts expectedUpdatedAt alongside extra fields when moving, and blocks TAKE_SELF_ONLY bypass", async () => {
        const { ownerId, list, editor } = await sharedSetup();
        const personal = (await editor.tasks("POST", "", { title: "Before move", orderIndex: 1 })).body.data;

        const forbidden = await editor.tasks("PATCH", `/${personal.id}`, {
            projectId: list.id,
            takenBy: ownerId,
        });
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.error.code).toBe("TAKE_SELF_ONLY");

        const moved = await editor.tasks("PATCH", `/${personal.id}`, {
            projectId: list.id,
            title: "After move",
            expectedUpdatedAt: personal.updatedAt,
        });
        expect(moved.status).toBe(200);
        expect(moved.body.data).toMatchObject({ projectId: list.id, title: "After move", userId: ownerId });
    });
});

describe("processing a capture into a shared list", () => {
    it("creates the task under the list owner with personal reminder and tags, and supports unprocess", async () => {
        const { ownerId, editorId, list, owner, editor } = await sharedSetup();
        const capture = (await editor.inbox("POST", "", { rawText: "Order groceries" })).body.data;
        const tag = (await editor.tags("POST", "", { name: "Errands", color: "#4a90d9" })).body.data;

        const processed = await editor.inbox("POST", `/${capture.id}/process`, {
            title: "Order groceries",
            projectId: list.id,
            tagIds: [tag.id],
            reminderAt: "2027-04-01T15:00:00Z",
        });
        expect(processed.status).toBe(201);
        expect(processed.body.data).toMatchObject({
            userId: ownerId,
            createdBy: editorId,
            projectId: list.id,
            tagIds: [tag.id],
            reminderAt: "2027-04-01T15:00:00.000Z",
        });

        const ownerTasks = (await owner.tasks("GET", `?projectId=${list.id}`)).body.data;
        const found = ownerTasks.find((t: { id: string }) => t.id === processed.body.data.id);
        expect(found).toMatchObject({ title: "Order groceries", reminderAt: null, tagIds: [] });

        const undone = await editor.inbox("POST", `/${capture.id}/unprocess`);
        expect(undone.status).toBe(200);
        const afterUndo = (await owner.tasks("GET", `?projectId=${list.id}&state=ARCHIVED`)).body.data;
        expect(afterUndo.some((t: { id: string }) => t.id === processed.body.data.id)).toBe(true);
    });

    it("refuses a viewer processing a capture into a shared list", async () => {
        const { list, viewer } = await sharedSetup();
        const capture = (await viewer.inbox("POST", "", { rawText: "Nope" })).body.data;
        const res = await viewer.inbox("POST", `/${capture.id}/process`, { title: "Nope", projectId: list.id });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("VIEW_ONLY");
    });
});
