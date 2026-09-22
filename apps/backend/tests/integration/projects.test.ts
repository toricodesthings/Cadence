import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";

let projects: ReturnType<typeof apiAs>;
let sections: ReturnType<typeof apiAs>;
let otherUser: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUser();
    projects = apiAs(userId, "/projects", projectRoutes);
    sections = apiAs(userId, "/sections", sectionRoutes);
    otherUser = apiAs(await createUser(), "/projects", projectRoutes);
});

describe("projects", () => {
    it("creates a project, letting the DB default the accent and leaving emoji empty", async () => {
        const { status, body } = await projects("POST", "", { name: "Sprint Alpha" });

        expect(status).toBe(201);
        expect(body.data).toMatchObject({ name: "Sprint Alpha", emoji: null });
        expect(body.data.colorAccent).toEqual(expect.any(String));
    });

    it("rejects an invalid body with 400", async () => {
        expect((await projects("POST", "", { name: "" })).status).toBe(400);
    });

    it("lists only the caller's projects", async () => {
        await projects("POST", "", { name: "Mine" });
        await otherUser("POST", "", { name: "Theirs" });

        const { body } = await projects("GET", "");

        expect(body.data.map((p: any) => p.name)).toEqual(["Mine"]);
    });

    it("updates only the sent fields, and clears the emoji with null", async () => {
        const { body: created } = await projects("POST", "", { name: "P", emoji: "🚀", colorAccent: "twilight-blue" });
        const id = created.data.id;

        expect((await projects("PATCH", `/${id}`, { name: "Renamed" })).body.data).toMatchObject({
            name: "Renamed",
            emoji: "🚀",
            colorAccent: "twilight-blue",
        });
        expect((await projects("PATCH", `/${id}`, { emoji: null })).body.data.emoji).toBeNull();
    });

    it("deleting a project deletes its sections", async () => {
        const { body: project } = await projects("POST", "", { name: "Doomed" });
        await sections("POST", "", { name: "To Do", orderIndex: 0, projectId: project.data.id });

        expect((await projects("DELETE", `/${project.data.id}`)).status).toBe(200);
        expect((await sections("GET", `?projectId=${project.data.id}`)).body.data).toEqual([]);
    });

    it("treats another user's project as not found for read, update, and delete, and leaves it intact", async () => {
        const { body: theirs } = await otherUser("POST", "", { name: "Theirs" });
        const id = theirs.data.id;

        expect((await projects("GET", `/${id}`)).status).toBe(404);
        expect((await projects("PATCH", `/${id}`, { name: "hijacked" })).status).toBe(404);
        expect((await projects("DELETE", `/${id}`)).status).toBe(404);
        expect((await otherUser("GET", `/${id}`)).body.data.name).toBe("Theirs");
    });
});
