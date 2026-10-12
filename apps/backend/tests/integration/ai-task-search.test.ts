import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { buildToolRegistry } from "../../src/domains/ai/tools";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { searchRoutes } from "../../src/domains/decisions/search.route";
import { noteRoutes } from "../../src/domains/notes/notes.route";

let userId: string;
let tasks: ReturnType<typeof apiAs>;
let run: (args: Record<string, unknown>) => Promise<any>;
let place: { projectId: string; sectionId: string };
const titles = (result: any) => result.tasks.map((task: any) => task.title).sort();

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser();
    tasks = apiAs(userId, "/tasks", taskRoutes);
    const project = (await apiAs(userId, "/projects", projectRoutes)("POST", "", { name: "CS App Projects" })).body.data;
    const section = (await apiAs(userId, "/sections", sectionRoutes)("POST", "", { name: "Cadence", projectId: project.id, orderIndex: 0 })).body.data;
    place = { projectId: project.id, sectionId: section.id };
    const tools = buildToolRegistry({} as any, userId, { timezone: "UTC", currentDate: "2026-10-12T12:00:00Z", today: "2026-10-12" }) as any;
    run = (args) => tools.get_tasks.execute({ limit: 20, ...args }, { toolCallId: "read", messages: [] });
    for (const title of ["Implement 0.31.0", "Implement 0.32.0", "Implement 0.31.01", "Implement 10.31.0", "Implement 0.31.0.1", "Implement 0.31.0-rc1", "Buy groceries"]) {
        expect((await tasks("POST", "", { title, orderIndex: 0, ...place })).status).toBe(201);
    }
});

describe("assistant task search", () => {
    it.each(["0.31.0", "implementation 0.31.0", "implementing 0.31.0", '“0.31.0”,', "v0.31.0", "Cadence implementation 0.31.0", "CS App Projects Cadence 0.31.0"])("finds the exact version for %s", async (query) => {
        expect(titles(await run({ query }))).toEqual(["Implement 0.31.0"]);
    });

    it("searches separate references separately; never changes AND to OR", async () => {
        expect(titles(await run({ query: "0.31.0 0.32.0" }))).toEqual([]);
        const results = await Promise.all(["0.31.0", "0.32.0"].map((query) => run({ query })));
        expect(results.flatMap(titles).sort()).toEqual(["Implement 0.31.0", "Implement 0.32.0"]);
    });

    it("does not drop a qualifier after the eighth word", async () => {
        await tasks("POST", "", { title: "one two three four five six seven eight", orderIndex: 0 });
        expect(titles(await run({ query: "one two three four five six seven eight nonexistent" }))).toEqual([]);
    });

    it.each(["0.33.0", "implementation 0.33.0", "groceries 0.31.0", "0,31.0", "%", "_", "\\", "!!!"])("does not invent or broaden a match for %s", async (query) => {
        expect(titles(await run({ query }))).toEqual([]);
    });

    it("keeps literal wildcard characters literal", async () => {
        await tasks("POST", "", { title: "Reach 100%", orderIndex: 0 });
        expect(titles(await run({ query: "100%" }))).toEqual(["Reach 100%"]);
    });

    it("keeps course codes, task numbers and prerelease suffixes distinct", async () => {
        for (const title of ["COMP3005 Assignment 1", "COMP30050 Assignment 1", "COMP3005 Assignment 10"]) {
            await tasks("POST", "", { title, orderIndex: 0 });
        }
        expect(titles(await run({ query: "comp3005 assignment 1" }))).toEqual(["COMP3005 Assignment 1"]);
        expect(titles(await run({ query: "comp assignment 1" }))).toEqual(["COMP3005 Assignment 1", "COMP30050 Assignment 1"]);
        expect(titles(await run({ query: "0.31.0-rc1" }))).toEqual(["Implement 0.31.0-rc1"]);
        expect(titles(await run({ query: "0.31.0-rc2" }))).toEqual([]);
    });

    it("matches ordinary word forms without accidental word fragments", async () => {
        for (const title of ["Pay rent", "Call parents", "Renew passport", "Book dentist", "Check dentistry course"]) {
            await tasks("POST", "", { title, orderIndex: 0 });
        }
        expect(titles(await run({ query: "rent" }))).toEqual(["Pay rent"]);
        expect(titles(await run({ query: "passport renewal" }))).toEqual(["Renew passport"]);
        expect(titles(await run({ query: "dentist booking" }))).toEqual(["Book dentist"]);
    });

    it("matches word forms in notes and placement, without requiring the title", async () => {
        const task = (await tasks("POST", "", { title: "Release checklist", orderIndex: 0, ...place })).body.data;
        await apiAs(userId, "/api", noteRoutes)("PATCH", `/tasks/${task.id}/note`, { body: "Implement v0.35.0." });
        expect(titles(await run({ query: "Cadence implementation 0.35.0" }))).toEqual(["Release checklist"]);
    });

    it("keeps ambiguous candidates visible and pages after filtering", async () => {
        await tasks("POST", "", { title: "Review 0.31.0", orderIndex: 0 });
        const first = await run({ query: "0.31.0", limit: 1 });
        expect(first).toMatchObject({ count: 1, more: true, nextOffset: 1 });
        const second = await run({ query: "0.31.0", limit: 1, offset: first.nextOffset });
        expect([...titles(first), ...titles(second)].sort()).toEqual(["Implement 0.31.0", "Review 0.31.0"]);
        expect(second.more).toBeUndefined();
    });

    it("preserves explicit filters, open state and tenant isolation", async () => {
        const other = await createUser();
        await apiAs(other, "/tasks", taskRoutes)("POST", "", { title: "Implement 0.31.0 other user", orderIndex: 0 });
        const done = (await tasks("POST", "", { title: "Implement 0.31.0 done", orderIndex: 0 })).body.data;
        await tasks("PATCH", `/${done.id}`, { state: "COMPLETE" });
        expect(titles(await run({ query: "0.31.0", ...place }))).toEqual(["Implement 0.31.0"]);
        expect(titles(await run({ query: "0.31.0", dueWindow: "overdue" }))).toEqual([]);
        expect(titles(await run({ query: "0.31.0", state: "COMPLETE" }))).toEqual(["Implement 0.31.0 done"]);
        expect(titles(await run({ query: "0.31.0", projectId: crypto.randomUUID() }))).toEqual([]);
    });
    it("ranks a title match before a higher-priority note reference, then honors explicit sorting", async () => {
        await tasks("POST", "", { title: "Release retrospective", content: "Discuss 0.31.0", priority: 4, orderIndex: 0 });
        expect((await run({ query: "0.31.0", limit: 1 })).tasks[0].title).toBe("Implement 0.31.0");
        expect((await run({ query: "0.31.0", limit: 1, sort: "priority" })).tasks[0].title).toBe("Release retrospective");
    });

    it("searches subtasks and tags across fields", async () => {
        const registry = buildToolRegistry({} as any, userId, { timezone: "UTC", currentDate: "2026-10-12T12:00:00Z", today: "2026-10-12" }) as any;
        const result = await registry.create_tasks.execute({ tasks: [{ title: "Renew passport", tagNames: ["Travel"], subtasks: ["Book appointment"] }] }, { toolCallId: crypto.randomUUID(), messages: [] });
        expect(result.ok).not.toBe(false);
        expect(titles(await run({ query: "passport booking travel" }))).toEqual(["Renew passport"]);
    });

    it("canonical notes replace stale legacy content, including when emptied", async () => {
        const task = (await tasks("POST", "", { title: "Release checklist", content: "obsoleteword", orderIndex: 0 })).body.data;
        const notes = apiAs(userId, "/api", noteRoutes);
        await notes("PATCH", `/tasks/${task.id}/note`, { body: "# Deployment\nImplement v0.35.0." });
        expect(titles(await run({ query: "obsoleteword" }))).toEqual([]);
        expect(titles(await run({ query: "implementation 0.35.0" }))).toEqual(["Release checklist"]);
        const search = apiAs(userId, "/search", searchRoutes);
        const snapshot = (await search("GET", "/task-notes")).body.data;
        expect(snapshot).toEqual([{ taskId: task.id, terms: ["deployment", "implement", "v0.35.0"], headings: ["Deployment"] }]);
        expect((await apiAs(await createUser(), "/search", searchRoutes)("GET", "/task-notes")).body.data).toEqual([]);
        const saved = (await notes("GET", `/tasks/${task.id}/note`)).body.data;
        await notes("PATCH", `/tasks/${task.id}/note`, { body: "", expectedVersion: saved.version });
        expect(titles(await run({ query: "0.35.0" }))).toEqual([]);
        expect(titles(await run({ query: "obsoleteword" }))).toEqual([]);
    });

});
