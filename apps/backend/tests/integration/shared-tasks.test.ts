import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { noteRoutes } from "../../src/domains/notes/notes.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";
import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { readTasks } from "../../src/domains/tasks/tasks.service";
import { withRls } from "../../src/platform/rls";
import { getTestDb } from "../helpers/db";

beforeAll(startTestDb);

const clients = (userId: string) => ({
    projects: apiAs(userId, "/projects", projectRoutes),
    tasks: apiAs(userId, "/tasks", taskRoutes),
    sections: apiAs(userId, "/sections", sectionRoutes),
    tags: apiAs(userId, "/tags", tagRoutes),
    notes: apiAs(userId, "", noteRoutes),
    steps: apiAs(userId, "", subtaskRoutes),
    lists: apiAs(userId, "/lists", sharingRoutes),
});

/** The owner's "Our House" with one task, shared with an editor, a viewer and (never) an outsider. */
async function house() {
    const [ownerId, editorId, viewerId, outsiderId] = await Promise.all([1, 2, 3, 4].map(() => createUser()));
    const owner = clients(ownerId);
    const list = (await owner.projects("POST", "", { name: "Our House" })).body.data;
    const task = (await owner.tasks("POST", "", { title: "Paint", orderIndex: 1, projectId: list.id })).body.data;
    for (const [id, role] of [
        [editorId, "edit"],
        [viewerId, "view"],
    ] as const) {
        const url = (await owner.lists("POST", `/${list.id}/invites`)).body.data.url;
        await clients(id).lists("POST", "/join", { token: tokenOf(url) });
        if (role === "edit") await owner.lists("PATCH", `/${list.id}/members/${id}`, { role });
    }
    return {
        ownerId,
        editorId,
        viewerId,
        outsiderId,
        list,
        task,
        owner,
        editor: clients(editorId),
        viewer: clients(viewerId),
        outsider: clients(outsiderId),
    };
}

describe("an editor", () => {
    it("creates, edits, completes, trashes and restores tasks in the list, and each stays the owner's", async () => {
        const { ownerId, editorId, list, editor, owner } = await house();
        const made = (await editor.tasks("POST", "", { title: "Buy milk", orderIndex: 2, projectId: list.id })).body
            .data;
        expect(made).toMatchObject({ userId: ownerId, createdBy: editorId, projectId: list.id });

        const edited = (await editor.tasks("PATCH", `/${made.id}`, { title: "Buy oat milk" })).body.data;
        expect(edited).toMatchObject({ title: "Buy oat milk", updatedBy: editorId });
        expect(
            (await editor.tasks("PATCH", "/batch/state", { taskIds: [made.id], state: "COMPLETE" })).body.data[0].state,
        ).toBe("COMPLETE");
        expect(
            (await editor.tasks("PATCH", "/batch/state", { taskIds: [made.id], state: "ARCHIVED" })).body.data[0].state,
        ).toBe("ARCHIVED");
        expect(
            (await editor.tasks("PATCH", "/batch/state", { taskIds: [made.id], state: "ACTIVE" })).body.data[0].state,
        ).toBe("ACTIVE");

        // The owner reads it, with who made it, and the trash an editor made lands in the owner's.
        const read = (await owner.tasks("GET", `/${made.id}`)).body.data;
        expect(read).toMatchObject({ title: "Buy oat milk", createdBy: editorId, updatedBy: editorId });
        await editor.tasks("PATCH", "/batch/state", { taskIds: [made.id], state: "ARCHIVED" });
        expect((await owner.tasks("GET", "?state=ARCHIVED")).body.data.map((t: any) => t.id)).toEqual([made.id]);
        expect((await editor.tasks("GET", "?state=ARCHIVED")).body.data).toEqual([]);
    });

    it("adds sections, steps and notes, and reorders", async () => {
        const { editorId, list, task, editor, owner } = await house();
        const section = (await editor.sections("POST", "", { name: "Rooms", orderIndex: 1, projectId: list.id })).body
            .data;
        expect(section).toMatchObject({ createdBy: editorId, projectId: list.id });
        expect((await editor.sections("PATCH", `/${section.id}`, { name: "Kitchen" })).body.data.name).toBe("Kitchen");
        expect((await editor.sections("GET", `?projectId=${list.id}`)).body.data.map((s: any) => s.name)).toEqual([
            "Kitchen",
        ]);

        const step = (await editor.steps("POST", `/tasks/${task.id}/subtasks`, { title: "Buy tape", orderIndex: 1 }))
            .body.data;
        expect(step.createdBy).toBe(editorId);
        expect((await editor.steps("PATCH", `/subtasks/${step.id}`, { isComplete: true })).body.data.isComplete).toBe(
            true,
        );
        expect((await owner.steps("GET", `/tasks/${task.id}/subtasks`)).body.data).toHaveLength(1);

        const note = (await editor.notes("PATCH", `/tasks/${task.id}/note`, { body: "Two coats", expectedVersion: 0 }))
            .body.data;
        expect(note).toMatchObject({ body: "Two coats", version: 1 });
        await editor.notes("PATCH", `/tasks/${task.id}/note`, { body: "Three coats", expectedVersion: 1 });
        expect((await owner.notes("GET", `/tasks/${task.id}/note`)).body.data).toMatchObject({
            body: "Three coats",
            updatedBy: editorId,
        });
        expect((await editor.steps("DELETE", `/subtasks/${step.id}`)).status).toBe(200);

        const second = (await editor.tasks("POST", "", { title: "Sand", orderIndex: 2, projectId: list.id })).body.data;
        const moved = await editor.tasks("PATCH", `/${second.id}/reorder`, { orderIndex: 0.5 });
        expect(moved.body.data.orderIndex).toBe(0.5);
        expect((await editor.tasks("POST", `/${second.id}/duplicate`)).body.data).toMatchObject({
            title: "Sand (copy)",
            projectId: list.id,
        });
    });

    it("can't set tags or reminders, move a task to another list, delete for good, or change the list", async () => {
        const { owner, ownerId, list, task, editor } = await house();
        const tag = (await owner.tags("POST", "", { name: "home" })).body.data;
        const other = (await owner.projects("POST", "", { name: "Private" })).body.data;
        for (const res of [
            await editor.tasks("POST", `/${task.id}/tags`, { tagId: tag.id }),
            await editor.tasks("DELETE", `/${task.id}/tags/${tag.id}`),
            await editor.tasks("POST", "", { title: "x", orderIndex: 1, projectId: list.id, tagIds: [tag.id] }),
            await editor.tasks("POST", "", {
                title: "x",
                orderIndex: 1,
                projectId: list.id,
                reminderAt: "2030-01-01T10:00:00.000Z",
            }),
            await editor.tasks("PATCH", `/${task.id}`, { reminderAt: "2030-01-01T10:00:00.000Z" }),
            await editor.tasks("PATCH", `/${task.id}`, { projectId: other.id }),
            await editor.tasks("DELETE", `/${task.id}`),
            await editor.tasks("POST", "/batch/delete", { taskIds: [task.id] }),
            await editor.sections("DELETE", `/${crypto.randomUUID()}`),
        ])
            expect([403, 404], JSON.stringify(res.body)).toContain(res.status);
        expect(
            (await editor.tasks("PATCH", `/${task.id}`, { reminderAt: "2030-01-01T10:00:00.000Z" })).body.error.code,
        ).toBe("OWNER_ONLY");
        expect((await editor.tasks("DELETE", `/${task.id}`)).body.error.code).toBe("OWNER_ONLY");
        expect((await editor.projects("PATCH", `/${list.id}`, { name: "Mine" })).status).toBe(403);
        expect((await editor.projects("DELETE", `/${list.id}`)).status).toBe(403);
        // The owner's other list is theirs alone.
        expect((await editor.tasks("POST", "", { title: "x", orderIndex: 1, projectId: other.id })).status).toBe(404);
        // Tags on a shared task are the owner's: the editor sees none, the owner keeps theirs.
        await owner.tasks("POST", `/${task.id}/tags`, { tagId: tag.id });
        expect((await editor.tasks("GET", `/${task.id}`)).body.data.tagIds).toEqual([]);
        expect((await editor.tasks("GET", `/${task.id}/tags`)).body.data).toEqual([]);
        expect((await owner.tasks("GET", `/${task.id}`)).body.data.tagIds).toEqual([tag.id]);
        expect((await owner.tasks("GET", `/${task.id}`)).body.data.userId).toBe(ownerId);
    });

    it("never trains the owner's models", async () => {
        const { ownerId, list, editor } = await house();
        const before = await asOwner(
            async (pg) =>
                (await pg.query<any>("SELECT count(*)::int AS n FROM task_nlp_metadata WHERE user_id = $1", [ownerId]))
                    .rows[0].n,
        );
        await editor.tasks("POST", "", {
            title: "Buy milk tomorrow",
            orderIndex: 2,
            projectId: list.id,
            nlp: { rawInput: "Buy milk tomorrow" },
        });
        const after = await asOwner(
            async (pg) =>
                (await pg.query<any>("SELECT count(*)::int AS n FROM task_nlp_metadata WHERE user_id = $1", [ownerId]))
                    .rows[0].n,
        );
        expect(after).toBe(before);
    });
});

describe("a viewer", () => {
    it("reads everything in the list and is refused every write", async () => {
        const { list, task, viewer } = await house();
        expect((await viewer.tasks("GET", `?projectId=${list.id}`)).body.data.map((t: any) => t.id)).toEqual([task.id]);
        expect((await viewer.tasks("GET", `/${task.id}`)).status).toBe(200);
        const writes = [
            viewer.tasks("POST", "", { title: "x", orderIndex: 1, projectId: list.id }),
            viewer.tasks("POST", `/${task.id}/duplicate`),
            viewer.tasks("PATCH", `/${task.id}`, { title: "x" }),
            viewer.tasks("PATCH", `/${task.id}/reorder`, { orderIndex: 3 }),
            viewer.tasks("PATCH", "/batch/state", { taskIds: [task.id], state: "COMPLETE" }),
            viewer.tasks("POST", "/batch/reschedule", { taskIds: [task.id], date: "2030-01-01" }),
            viewer.sections("POST", "", { name: "x", orderIndex: 1, projectId: list.id }),
            viewer.steps("POST", `/tasks/${task.id}/subtasks`, { title: "x", orderIndex: 1 }),
            viewer.notes("PATCH", `/tasks/${task.id}/note`, { body: "x" }),
        ];
        for (const res of await Promise.all(writes)) {
            expect(res.status).toBe(403);
            expect(res.body.error).toMatchObject({
                code: "VIEW_ONLY",
                message: "You can view this list, not change it.",
            });
        }
    });
});

describe("a non-member", () => {
    it("gets 404 for the list's tasks, sections, steps and notes, and can't write there", async () => {
        const { list, task, outsider } = await house();
        for (const [i, res] of [
            await outsider.tasks("GET", `/${task.id}`),
            await outsider.tasks("PATCH", `/${task.id}`, { title: "x" }),
            await outsider.tasks("POST", "", { title: "x", orderIndex: 1, projectId: list.id }),
            await outsider.steps("GET", `/tasks/${task.id}/subtasks`),
            await outsider.notes("GET", `/tasks/${task.id}/note`),
            await outsider.projects("GET", `/${list.id}`),
        ].entries())
            expect(res.status, `request ${i}`).toBe(404);
        // Batches skip what isn't theirs, as they always have.
        expect(
            (await outsider.tasks("PATCH", "/batch/state", { taskIds: [task.id], state: "COMPLETE" })).body.data,
        ).toEqual([]);
        expect((await outsider.tasks("GET", "")).body.data).toEqual([]);
        expect((await outsider.sections("GET", `?projectId=${list.id}`)).body.data).toEqual([]);
    });
});

describe("batches across lists", () => {
    it("moves an editor's own task and a shared one in one state change, and skips what isn't theirs", async () => {
        const { editorId, list, task, editor, owner } = await house();
        const mine = (await editor.tasks("POST", "", { title: "Mine", orderIndex: 1 })).body.data;
        const stranger = (await owner.tasks("POST", "", { title: "Private", orderIndex: 5 })).body.data;
        const done = (
            await editor.tasks("PATCH", "/batch/state", { taskIds: [mine.id, task.id, stranger.id], state: "COMPLETE" })
        ).body.data;
        expect(done.map((t: any) => t.id).sort()).toEqual([mine.id, task.id].sort());
        expect(mine.userId).toBe(editorId);
        expect(list.id).toBeTruthy();
    });

    it("reschedules shared tasks in the caller's own day", async () => {
        const { editorId, task, editor } = await house();
        await asOwner((pg) => pg.query("UPDATE users SET time_zone = 'Pacific/Auckland' WHERE id = $1", [editorId]));
        const rescheduled = (
            await editor.tasks("POST", "/batch/reschedule", { taskIds: [task.id], date: "2030-03-04" })
        ).body.data;
        expect(rescheduled[0].dueDate).toBe("2030-03-04");
    });
});

describe("Today, Upcoming and Schedule", () => {
    it("shows a shared list's dated tasks to both people, and keeps Trash each person's own", async () => {
        const { ownerId, editorId, list, editor, owner } = await house();
        const dated = (
            await editor.tasks("POST", "", {
                title: "Buy milk",
                orderIndex: 2,
                projectId: list.id,
                dueDate: "2030-03-04",
            })
        ).body.data;
        for (const person of [owner, editor]) {
            const { body } = await person.tasks("GET", "?from=2030-03-04&to=2030-03-04");
            expect(body.data.map((t: any) => t.id)).toContain(dated.id);
        }
        const batch = await editor.tasks(
            "GET",
            `/batch?queries=${encodeURIComponent(JSON.stringify([{ state: "ACTIVE", from: "2030-03-04", to: "2030-03-04" }]))}`,
        );
        expect(batch.body.data.tasks.map((t: any) => t.id)).toContain(dated.id);

        await editor.tasks("PATCH", "/batch/state", { taskIds: [dated.id], state: "ARCHIVED" });
        expect((await editor.tasks("GET", "?state=ARCHIVED")).body.data).toEqual([]);
        expect((await owner.tasks("GET", "?state=ARCHIVED")).body.data.map((t: any) => t.id)).toEqual([dated.id]);
        expect(ownerId).not.toBe(editorId);
    });

    it("leaves the assistant, planning and metrics reads to each person's own tasks", async () => {
        const { editorId, list, editor } = await house();
        await editor.tasks("POST", "", { title: "Buy milk", orderIndex: 2, projectId: list.id, dueDate: "2030-03-04" });
        // The same service the assistant's tools call, without the shared option.
        const own = await withRls(getTestDb(), editorId, (tx) =>
            readTasks(tx, editorId, { from: "2030-03-04", to: "2030-03-04" }),
        );
        expect(own).toEqual([]);
    });
});
