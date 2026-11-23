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

const ctx: AgentContext = {
    today: "2030-03-04",
    timezone: "UTC",
    currentDate: "2030-03-04T12:00:00.000Z",
    weekStart: "Sunday",
};

const call = (tool: { execute?: unknown }, input: object, id = crypto.randomUUID()) =>
    (tool.execute as (i: object, o: object) => Promise<any>)(input, { toolCallId: id, messages: [] });

async function setup() {
    const ownerId = await createUser({ name: "Ada" });
    const editorId = await createUser({ name: "Sam" });
    const ownerProjects = apiAs(ownerId, "/projects", projectRoutes);
    const ownerTasks = apiAs(ownerId, "/tasks", taskRoutes);
    const ownerSections = apiAs(ownerId, "/sections", sectionRoutes);
    const ownerNotes = apiAs(ownerId, "", noteRoutes);
    const ownerLists = apiAs(ownerId, "/lists", sharingRoutes);
    const editorLists = apiAs(editorId, "/lists", sharingRoutes);
    const editorTasks = apiAs(editorId, "/tasks", taskRoutes);

    const sharedList = (await ownerProjects("POST", "", { name: "Our House" })).body.data;
    const privateList = (await ownerProjects("POST", "", { name: "Private" })).body.data;
    const section = (await ownerSections("POST", "", { name: "Groceries", orderIndex: 1, projectId: sharedList.id }))
        .body.data;
    const { url } = (await ownerLists("POST", `/${sharedList.id}/invites`, { role: "edit" })).body.data;
    await editorLists("POST", "/join", { token: tokenOf(url) });

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

    return {
        ownerId,
        editorId,
        sharedList,
        privateList,
        section,
        sharedTask,
        privateTask,
        ownerTools: buildToolRegistry({} as Env, ownerId, ctx),
        editorTools: buildToolRegistry({} as Env, editorId, ctx),
    };
}

describe("assistant tools on shared lists", () => {
    it("reads shared lists, tasks, details, and schedule with people's names and never emails", async () => {
        const { sharedList, sharedTask, ownerTools, editorTools } = await setup();

        // Editor's get_tasks includes the shared task with names.
        const tasksRes = await call(editorTools.get_tasks, { projectId: sharedList.id });
        expect(tasksRes.tasks).toHaveLength(1);
        expect(tasksRes.tasks[0]).toMatchObject({
            id: sharedTask.id,
            title: "Buy milk",
            shared: true,
            createdBy: "Sam",
            takenBy: "Sam",
        });

        // Editor's get_task_detail reads the shared note and attribution.
        const detail = await call(editorTools.get_task_detail, { taskId: sharedTask.id });
        expect(detail.task).toMatchObject({ shared: true, createdBy: "Sam", takenBy: "Sam" });
        expect(detail.note.text).toContain("Oat milk please");

        // Editor's get_projects shows role and people without emails or ids.
        const projectsRes = await call(editorTools.get_projects, {});
        expect(projectsRes.projects).toHaveLength(1);
        expect(projectsRes.projects[0].shared).toEqual({
            role: "edit",
            people: [
                { name: "Ada", role: "owner" },
                { name: "Sam", role: "edit" },
            ],
        });
        expect(JSON.stringify(projectsRes)).not.toContain("@example.test");

        // Owner's get_schedule_window includes the shared task with taker's name.
        const sched = await call(ownerTools.get_schedule_window, { start: "2030-03-04", end: "2030-03-04" });
        expect(sched.tasks).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: sharedTask.id, shared: true, takenBy: "Sam" })]),
        );
    });

    it("refuses every write tool on a shared list with SHARED_READ_ONLY (owner and member), while unshared lists still write", async () => {
        const { sharedList, privateList, section, sharedTask, privateTask, ownerTools, editorTools } = await setup();

        const attempts = [
            call(ownerTools.create_tasks, { tasks: [{ title: "Bread", projectId: sharedList.id }] }),
            call(editorTools.create_tasks, { tasks: [{ title: "Bread", projectId: sharedList.id }] }),
            call(ownerTools.update_tasks, { taskIds: [sharedTask.id], patch: { title: "Soy milk" } }),
            call(editorTools.update_tasks, { taskIds: [sharedTask.id], patch: { title: "Soy milk" } }),
            call(ownerTools.reschedule_tasks, { taskIds: [sharedTask.id], targetDate: "2030-03-05" }),
            call(ownerTools.set_task_state, { taskIds: [sharedTask.id], state: "COMPLETE" }),
            call(ownerTools.delete_tasks, { tasks: [{ taskId: sharedTask.id, title: "Buy milk" }] }),
            call(ownerTools.duplicate_tasks, { tasks: [{ taskId: sharedTask.id }] }),
            call(ownerTools.reorder_tasks, { taskIds: [sharedTask.id], to: "top" }),
            call(ownerTools.edit_subtasks, { taskId: sharedTask.id, add: ["Check fridge"] }),
            call(ownerTools.update_project, { projectId: sharedList.id, patch: { name: "Renamed" } }),
            call(ownerTools.delete_project, { projectId: sharedList.id, name: "Our House" }),
            call(ownerTools.create_sections, { projectId: sharedList.id, names: ["Hardware"] }),
            call(ownerTools.update_section, { sectionId: section.id, name: "Pantry" }),
            call(ownerTools.delete_section, { sectionId: section.id }),
        ];

        for (const res of await Promise.all(attempts)) {
            expect(res.ok).toBe(false);
            expect(res.code).toBe("SHARED_READ_ONLY");
        }

        // Unshared list writes still succeed.
        const okUpdate = await call(ownerTools.update_tasks, {
            taskIds: [privateTask.id],
            patch: { title: "Pay rent early" },
        });
        expect(okUpdate.updated).toBe(1);
        const okCreate = await call(ownerTools.create_tasks, {
            tasks: [{ title: "New private", projectId: privateList.id }],
        });
        expect(okCreate.created).toHaveLength(1);
    });
});
