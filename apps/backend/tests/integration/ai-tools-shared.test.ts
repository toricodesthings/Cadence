import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";
import { tokenOf } from "../helpers/sharing";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { buildToolRegistry, type AgentContext } from "../../src/domains/ai/tools/index";
import { noteRoutes } from "../../src/domains/notes/notes.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";
import { sharingRoutes } from "../../src/domains/sharing/sharing.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import type { Env } from "../../src/types/env";

beforeAll(startTestDb);

const makeCtx = (waitUntil?: (p: Promise<unknown>) => void): AgentContext => ({
    today: "2030-03-04",
    timezone: "UTC",
    currentDate: "2030-03-04T12:00:00.000Z",
    weekStart: "Sunday",
    waitUntil,
});

const call = (tool: { execute?: unknown }, input: object, id = crypto.randomUUID()) =>
    (tool.execute as (i: object, o: object) => Promise<any>)(input, { toolCallId: id, messages: [] });

async function setup() {
    const ownerId = await createUser({ name: "Ada" });
    const editorId = await createUser({ name: "Sam" });
    const viewerId = await createUser({ name: "Kai" });
    const ownerProjects = apiAs(ownerId, "/projects", projectRoutes);
    const ownerTasks = apiAs(ownerId, "/tasks", taskRoutes);
    const ownerSections = apiAs(ownerId, "/sections", sectionRoutes);
    const ownerNotes = apiAs(ownerId, "", noteRoutes);
    const ownerLists = apiAs(ownerId, "/lists", sharingRoutes);
    const editorLists = apiAs(editorId, "/lists", sharingRoutes);
    const viewerLists = apiAs(viewerId, "/lists", sharingRoutes);
    const editorTasks = apiAs(editorId, "/tasks", taskRoutes);

    const sharedList = (await ownerProjects("POST", "", { name: "Our House" })).body.data;
    const privateList = (await ownerProjects("POST", "", { name: "Private" })).body.data;
    const section = (await ownerSections("POST", "", { name: "Groceries", orderIndex: 1, projectId: sharedList.id }))
        .body.data;

    const editInvite = (await ownerLists("POST", `/${sharedList.id}/invites`, { role: "edit" })).body.data;
    await editorLists("POST", "/join", { token: tokenOf(editInvite.url) });
    const viewInvite = (await ownerLists("POST", `/${sharedList.id}/invites`, { role: "view" })).body.data;
    await viewerLists("POST", "/join", { token: tokenOf(viewInvite.url) });

    const sharedTask = (
        await editorTasks("POST", "", {
            title: "Buy milk",
            orderIndex: 1,
            projectId: sharedList.id,
            sectionId: section.id,
            dueDate: "2030-03-04",
        })
    ).body.data;
    await editorTasks("PATCH", `/${sharedTask.id}`, { takenBy: editorId });
    await ownerNotes("PATCH", `/tasks/${sharedTask.id}/note`, { body: "Oat milk please", expectedVersion: 0 });

    const privateTask = (await ownerTasks("POST", "", { title: "Pay rent", orderIndex: 1, projectId: privateList.id }))
        .body.data;

    const pending: Promise<unknown>[] = [];
    const pings: string[] = [];
    const fakeEnv = {
        REMINDER_CLOCK: {
            idFromName: (id: string) => id,
            get: (id: string) => ({
                replan: async () => {
                    pings.push(`replan:${id}`);
                },
                ping: async () => {
                    pings.push(`ping:${id}`);
                },
            }),
        },
    } as unknown as Env;

    const waitUntil = (p: Promise<unknown>) => {
        pending.push(p);
    };

    return {
        ownerId,
        editorId,
        viewerId,
        sharedList,
        privateList,
        section,
        sharedTask,
        privateTask,
        ownerTasks,
        pings,
        flush: () => Promise.all(pending.splice(0)),
        ownerTools: buildToolRegistry(fakeEnv, ownerId, makeCtx(waitUntil)),
        editorTools: buildToolRegistry(fakeEnv, editorId, makeCtx(waitUntil)),
        viewerTools: buildToolRegistry(fakeEnv, viewerId, makeCtx(waitUntil)),
    };
}

describe("assistant tools on shared lists", () => {
    it("reads shared lists, tasks, details, and schedule with people's names, updatedAt, and never emails", async () => {
        const { sharedList, sharedTask, ownerTools, editorTools } = await setup();

        const tasksRes = await call(editorTools.get_tasks, { projectId: sharedList.id });
        expect(tasksRes.tasks).toHaveLength(1);
        expect(tasksRes.tasks[0]).toMatchObject({
            id: sharedTask.id,
            title: "Buy milk",
            shared: true,
            createdBy: "Sam",
            takenBy: "Sam",
        });
        expect(typeof tasksRes.tasks[0].updatedAt).toBe("string");

        const detail = await call(editorTools.get_task_detail, { taskId: sharedTask.id });
        expect(detail.task).toMatchObject({ shared: true, createdBy: "Sam", takenBy: "Sam" });
        expect(detail.note.text).toContain("Oat milk please");

        const projectsRes = await call(editorTools.get_projects, {});
        expect(projectsRes.projects).toHaveLength(1);
        expect(projectsRes.projects[0].shared).toEqual({
            role: "edit",
            people: [
                { name: "Ada", role: "owner" },
                { name: "Sam", role: "edit" },
                { name: "Kai", role: "view" },
            ],
        });
        expect(JSON.stringify(projectsRes)).not.toContain("@example.test");

        const sched = await call(ownerTools.get_schedule_window, { start: "2030-03-04", end: "2030-03-04" });
        expect(sched.tasks).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: sharedTask.id, shared: true, takenBy: "Sam" })]),
        );
    });

    it("allows owner and editor writes with live fanout, blocks viewers and non-owner list changes", async () => {
        const {
            ownerId,
            editorId,
            viewerId,
            sharedList,
            section,
            sharedTask,
            ownerTools,
            editorTools,
            viewerTools,
            pings,
            flush,
        } = await setup();

        // Editor creates a task in the shared list -> succeeds and notifies audience.
        const made = await call(editorTools.create_tasks, {
            tasks: [{ title: "Buy bread", projectId: sharedList.id }],
        });
        expect(made.created).toHaveLength(1);
        await flush();
        expect(pings).toContain(`replan:${editorId}`);
        expect(pings).toContain(`replan:${ownerId}`);
        expect(pings).toContain(`ping:${viewerId}`);

        // Editor updates, reschedules, edits subtasks, creates & renames sections.
        const updated = await call(editorTools.update_tasks, {
            taskIds: [sharedTask.id],
            patch: { title: "Buy oat milk" },
        });
        expect(updated.updated).toBe(1);

        const rescheduled = await call(editorTools.reschedule_tasks, {
            taskIds: [sharedTask.id],
            targetDate: "2030-03-05",
        });
        expect(rescheduled.moved).toBe(1);

        const subs = await call(editorTools.edit_subtasks, { taskId: sharedTask.id, add: ["Check fridge"] });
        expect(subs.added).toHaveLength(1);

        const sec = await call(editorTools.create_sections, { projectId: sharedList.id, names: ["Hardware"] });
        expect(sec.sections).toHaveLength(1);

        // Editor cannot rename/delete the list or delete sections (OWNER_ONLY).
        const renameDenied = await call(editorTools.update_project, {
            projectId: sharedList.id,
            patch: { name: "Renamed" },
        });
        expect(renameDenied).toMatchObject({ ok: false, code: "OWNER_ONLY" });

        const delSecDenied = await call(editorTools.delete_section, { sectionId: section.id });
        expect(delSecDenied).toMatchObject({ ok: false, code: "OWNER_ONLY" });

        // Owner CAN rename the list.
        const renamed = await call(ownerTools.update_project, {
            projectId: sharedList.id,
            patch: { name: "Our Home" },
        });
        expect(renamed.name).toBe("Our Home");

        // Viewer cannot write anything (VIEW_ONLY).
        const viewCreate = await call(viewerTools.create_tasks, {
            tasks: [{ title: "Sneak", projectId: sharedList.id }],
        });
        expect(viewCreate).toMatchObject({ ok: false, code: "VIEW_ONLY" });

        const viewUpdate = await call(viewerTools.update_tasks, {
            taskIds: [sharedTask.id],
            patch: { title: "Nope" },
        });
        expect(viewUpdate).toMatchObject({ ok: false, code: "VIEW_ONLY" });
    });

    it("guards against stale writes by naming who changed the shared task", async () => {
        const { sharedList, sharedTask, ownerTasks, editorTools } = await setup();

        // Editor reads the shared task (records seenTaskUpdatedAt in ctx).
        const read = await call(editorTools.get_tasks, { projectId: sharedList.id });
        expect(read.tasks[0].id).toBe(sharedTask.id);

        // Owner edits the task in the meantime.
        await new Promise((r) => setTimeout(r, 15));
        await ownerTasks("PATCH", `/${sharedTask.id}`, { title: "Buy almond milk" });

        // Editor attempts to write without re-reading -> STALE_WRITE naming Ada.
        const stale = await call(editorTools.update_tasks, {
            taskIds: [sharedTask.id],
            patch: { title: "Buy soy milk" },
        });
        expect(stale).toMatchObject({ ok: false, code: "STALE_WRITE", status: 409 });
        expect(stale.error).toContain("Ada");
        expect(stale.error).toContain("changed");
    });

    it("checks for duplicate titles across all members when creating in a shared list", async () => {
        const { sharedList, ownerTools } = await setup();

        // "Buy milk" was created by Sam; Ada tries to create "buy milk" without sameTitleOk.
        const held = await call(ownerTools.create_tasks, {
            tasks: [{ title: "buy milk", projectId: sharedList.id }],
        });
        expect(held.created).toHaveLength(0);
        expect(held.sameTitle).toEqual(
            expect.arrayContaining([expect.objectContaining({ title: "Buy milk", createdBy: "Sam" })]),
        );

        // With sameTitleOk: true it proceeds.
        const forced = await call(ownerTools.create_tasks, {
            tasks: [{ title: "buy milk", projectId: sharedList.id }],
            sameTitleOk: true,
        });
        expect(forced.created).toHaveLength(1);
    });

    it("isolates private tasks from shared-list live broadcasts via scopeLiveBroadcasts", async () => {
        const { scopeLiveBroadcasts } = await import("../../src/domains/ai/tools/shared-guard");
        const priv = { type: "task" as const, task: { id: "t-priv", projectId: null } as never };
        const sh1 = { type: "task" as const, task: { id: "t-s1", projectId: "list-1" } as never };
        const sh2 = { type: "task" as const, task: { id: "t-s2", projectId: "list-2" } as never };
        const batches = scopeLiveBroadcasts(
            [
                { listId: "list-1", role: "edit", ownerId: "u-owner", audience: ["u-owner", "u-a"] },
                { listId: "list-2", role: "edit", ownerId: "u-owner", audience: ["u-owner", "u-b"] },
            ],
            [priv, sh1, sh2],
        );
        // Private task is never included in any shared-list broadcast; each shared list gets only its own task.
        expect(batches).toHaveLength(2);
        expect(batches.some((b) => b.changes.some((c) => c.type === "task" && c.task.id === "t-priv"))).toBe(false);
        const s1Batch = batches.find((b) => b.changes.some((c) => c.type === "task" && c.task.id === "t-s1"));
        expect(s1Batch?.audience).toEqual(["u-owner", "u-a"]);
        expect(s1Batch?.changes).toHaveLength(1);
        const s2Batch = batches.find((b) => b.changes.some((c) => c.type === "task" && c.task.id === "t-s2"));
        expect(s2Batch?.audience).toEqual(["u-owner", "u-b"]);
        expect(s2Batch?.changes).toHaveLength(1);
    });
});
