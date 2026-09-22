import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";

let sections: ReturnType<typeof apiAs>;
let projects: ReturnType<typeof apiAs>;
let otherSections: ReturnType<typeof apiAs>;
let otherProjects: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUser();
    const otherId = await createUser();
    sections = apiAs(userId, "/sections", sectionRoutes);
    projects = apiAs(userId, "/projects", projectRoutes);
    otherSections = apiAs(otherId, "/sections", sectionRoutes);
    otherProjects = apiAs(otherId, "/projects", projectRoutes);
});

describe("sections", () => {
    it("lists unscoped sections and project sections separately, each ordered by orderIndex", async () => {
        const { body: project } = await projects("POST", "", { name: "P" });
        const projectId = project.data.id;
        await sections("POST", "", { name: "Later", orderIndex: 2 });
        await sections("POST", "", { name: "Now", orderIndex: 1 });
        await sections("POST", "", { name: "In P", orderIndex: 0, projectId });

        expect((await sections("GET", "")).body.data.map((s: any) => s.name)).toEqual(["Now", "Later"]);
        expect((await sections("GET", `?projectId=${projectId}`)).body.data.map((s: any) => s.name)).toEqual(["In P"]);
    });

    it("rejects an invalid body with 400", async () => {
        expect((await sections("POST", "", { name: "Missing orderIndex" })).status).toBe(400);
    });

    it("refuses to create a section in another user's project", async () => {
        const { body: theirs } = await otherProjects("POST", "", { name: "Theirs" });

        const { status } = await sections("POST", "", { name: "Sneaky", orderIndex: 0, projectId: theirs.data.id });

        // RLS hides the row, so ownership resolves as "not found" and never leaks that it exists.
        expect(status).toBe(404);
        expect((await otherSections("GET", `?projectId=${theirs.data.id}`)).body.data).toEqual([]);
    });

    it("updates only the sent fields", async () => {
        const { body: created } = await sections("POST", "", { name: "To Do", orderIndex: 0 });

        const { body } = await sections("PATCH", `/${created.data.id}`, { orderIndex: 5 });

        expect(body.data).toMatchObject({ name: "To Do", orderIndex: 5 });
    });

    it("deletes a section", async () => {
        const { body: created } = await sections("POST", "", { name: "Gone", orderIndex: 0 });

        expect((await sections("DELETE", `/${created.data.id}`)).body.data).toEqual({ id: created.data.id });
        expect((await sections("GET", "")).body.data).toEqual([]);
    });

    it("treats another user's section as not found for update and delete, and leaves it intact", async () => {
        const { body: theirs } = await otherSections("POST", "", { name: "Theirs", orderIndex: 0 });
        const id = theirs.data.id;

        expect((await sections("PATCH", `/${id}`, { name: "hijacked" })).status).toBe(404);
        expect((await sections("DELETE", `/${id}`)).status).toBe(404);
        expect((await otherSections("GET", "")).body.data.map((s: any) => s.name)).toEqual(["Theirs"]);
    });
});
