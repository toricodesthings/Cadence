import { beforeAll, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";
import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

beforeAll(startTestDb);

it("a list gets a section, a task with steps and a tag, and the task can be copied", async () => {
    const userId = await createUser();
    const projects = apiAs(userId, "/projects", projectRoutes);
    const sections = apiAs(userId, "/sections", sectionRoutes);
    const tasks = apiAs(userId, "/tasks", taskRoutes);
    const tags = apiAs(userId, "/tags", tagRoutes);
    const api = apiAs(userId, "", subtaskRoutes);

    const project = (await projects("POST", "", { name: "Move house" })).body.data;
    const section = (await sections("POST", "", { name: "Before", orderIndex: 1, projectId: project.id })).body.data;
    const task = (
        await tasks("POST", "", { title: "Book movers", orderIndex: 1, projectId: project.id, sectionId: section.id })
    ).body.data;
    await api("POST", `/tasks/${task.id}/subtasks`, { title: "Get three quotes", orderIndex: 1 });
    const tag = (await tags("POST", "", { name: "errands" })).body.data;
    expect((await tasks("POST", `/${task.id}/tags`, { tagId: tag.id })).status).toBe(201);

    const read = (await tasks("GET", `/${task.id}`)).body.data;
    expect(read).toMatchObject({ projectId: project.id, sectionId: section.id });
    expect((await tasks("GET", `/${task.id}/tags`)).body.data.map((t: any) => t.name)).toEqual(["errands"]);
    expect((await api("GET", `/tasks/${task.id}/subtasks`)).body.data.map((s: any) => s.title)).toEqual([
        "Get three quotes",
    ]);

    const copy = (await tasks("POST", `/${task.id}/duplicate`)).body.data;
    expect(copy).toMatchObject({ title: "Book movers (copy)", projectId: project.id });
    expect(copy.id).not.toBe(task.id);
});
