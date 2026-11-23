import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { createTasks, updateTasks } from "../../src/domains/tasks/tasks.service";
import { withRls } from "../../src/platform/rls";
import { projects, tags, taskSections, taskTags } from "../../src/db/schema";
import { eq } from "drizzle-orm";

let userId: string;
let api: ReturnType<typeof apiAs>;
let tagApi: ReturnType<typeof apiAs>;
let ids: { uni: string; c2: string; c1: string; tUni: string; tC2: string; tC1: string };

const seed = (uid: string) =>
    withRls(getTestDb(), uid, async (tx) => {
        const [uni] = await tx.insert(projects).values({ userId: uid, name: "University" }).returning();
        const [c2, c1] = await tx
            .insert(taskSections)
            .values([
                { userId: uid, projectId: uni.id, name: "COMPUTER2000", orderIndex: 0 },
                { userId: uid, projectId: uni.id, name: "COMPUTER1000", orderIndex: 1 },
            ])
            .returning();
        const [tUni, tC2, tC1] = await tx
            .insert(tags)
            .values([
                { userId: uid, name: "University", sortOrder: 1 },
                { userId: uid, name: "COMPUTER 2000", sortOrder: 2 },
                { userId: uid, name: "Computer-1000", sortOrder: 3 },
            ])
            .returning();
        return { uni: uni.id, c2: c2.id, c1: c1.id, tUni: tUni.id, tC2: tC2.id, tC1: tC1.id };
    });

const create = async (body: Record<string, unknown>) =>
    (await api("POST", "", { title: "t", orderIndex: 0, ...body })).body.data;
const move = async (id: string, body: Record<string, unknown>) =>
    (await api("PATCH", `/${id}`, body)).body.data.tagIds as string[];
const links = async (taskId: string) =>
    (await withRls(getTestDb(), userId, (tx) => tx.select().from(taskTags).where(eq(taskTags.taskId, taskId)))).length;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser({ zone: "America/Toronto" });
    api = apiAs(userId, "/tasks", taskRoutes);
    tagApi = apiAs(userId, "/tags", tagRoutes);
    ids = await seed(userId);
});

describe("auto-tag on create", () => {
    it("tags by list and section, and never twice", async () => {
        const task = await create({ projectId: ids.uni, sectionId: ids.c2 });
        expect(new Set(task.tagIds)).toEqual(new Set([ids.tUni, ids.tC2]));
        const again = await create({ projectId: ids.uni, sectionId: ids.c2, tagIds: [ids.tC2] });
        expect(again.tagIds).toHaveLength(2);
        expect(await links(again.id)).toBe(2);
    });
    it("gives the Inbox nothing, and nothing when switched off", async () => {
        expect((await create({})).tagIds).toEqual([]);
        const off = await createUser({ settings: { tasks: { autoTag: false } } });
        const offIds = await seed(off);
        const res = await apiAs(off, "/tasks", taskRoutes)("POST", "", {
            title: "t",
            orderIndex: 0,
            projectId: offIds.uni,
            sectionId: offIds.c2,
        });
        expect(res.body.data.tagIds).toEqual([]);
    });
    it("tags a task the assistant creates", async () => {
        const [made] = await withRls(getTestDb(), userId, (tx) =>
            createTasks(tx, userId, [{ title: "x", projectId: ids.uni, sectionId: ids.c2 }]),
        );
        expect(await links(made.taskId)).toBe(2);
    });
    it("tags a processed capture", async () => {
        const inbox = apiAs(userId, "/inbox", inboxRoutes);
        const item = (await inbox("POST", "", { rawText: "read chapter" })).body.data;
        const placed = await inbox("POST", `/${item.id}/process`, {
            title: "read chapter",
            projectId: ids.uni,
            sectionId: ids.c2,
        });
        expect(await links(placed.body.data.id)).toBe(2);
    });
});

describe("auto-tag on move", () => {
    it("swaps the section tag, keeps the list tag, and swaps back", async () => {
        const task = await create({ projectId: ids.uni, sectionId: ids.c2 });
        expect(new Set(await move(task.id, { sectionId: ids.c1 }))).toEqual(new Set([ids.tUni, ids.tC1]));
        expect(new Set(await move(task.id, { sectionId: ids.c2 }))).toEqual(new Set([ids.tUni, ids.tC2]));
    });
    it("drops list and section tags when moved to the Inbox", async () => {
        const task = await create({ projectId: ids.uni, sectionId: ids.c2 });
        expect(await move(task.id, { projectId: null })).toEqual([]);
    });
    it("lets an explicit bulk removal win", async () => {
        const task = await create({ projectId: ids.uni, sectionId: ids.c2 });
        await withRls(getTestDb(), userId, (tx) =>
            updateTasks(tx, userId, {
                taskIds: [task.id],
                patch: { sectionId: ids.c1 },
                removeTagIds: [ids.tC1],
            }),
        );
        expect(await links(task.id)).toBe(1);
    });
    it("changes no tags when off", async () => {
        const off = await createUser({ settings: { tasks: { autoTag: false } } });
        const o = await seed(off);
        const offApi = apiAs(off, "/tasks", taskRoutes);
        const t = (await offApi("POST", "", { title: "t", orderIndex: 0, projectId: o.uni, sectionId: o.c2 })).body
            .data;
        expect((await offApi("PATCH", `/${t.id}`, { sectionId: o.c1 })).body.data.tagIds).toEqual([]);
    });
});

describe("tagging existing tasks", () => {
    it("offers only open untagged tasks, links only what's new, and undoes exactly that", async () => {
        await withRls(getTestDb(), userId, (tx) => tx.delete(tags).where(eq(tags.id, ids.tC2)));
        const a = await create({ projectId: ids.uni, sectionId: ids.c2 });
        const b = await create({ projectId: ids.uni, sectionId: ids.c2 });
        const done = await create({ projectId: ids.uni, sectionId: ids.c2 });
        await api("PATCH", `/${done.id}`, { state: "COMPLETE" });
        const tag = (await tagApi("POST", "", { name: "COMPUTER 2000" })).body.data;
        expect(await links(a.id)).toBe(1);

        const matches = (await tagApi("GET", `/${tag.id}/place-matches`)).body.data;
        expect(matches.places).toEqual([{ kind: "section", name: "COMPUTER2000" }]);
        expect(new Set(matches.taskIds)).toEqual(new Set([a.id, b.id]));

        await tagApi("POST", `/${tag.id}/tasks`, { taskIds: [a.id], linked: true });
        const added = (await tagApi("POST", `/${tag.id}/tasks`, { taskIds: [a.id, b.id], linked: true })).body.data;
        expect(added.taskIds).toEqual([b.id]);
        const undone = (await tagApi("POST", `/${tag.id}/tasks`, { taskIds: added.taskIds, linked: false })).body.data;
        expect(undone.taskIds).toEqual([b.id]);
        expect(await links(a.id)).toBe(2);
        expect(await links(b.id)).toBe(1);
    });
    it("404s another user's tag", async () => {
        const other = await createUser();
        const res = await apiAs(other, "/tags", tagRoutes)("GET", `/${ids.tC2}/place-matches`);
        expect(res.status).toBe(404);
    });
});
