import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

let inbox: ReturnType<typeof apiAs>;
let tasks: ReturnType<typeof apiAs>;
let projects: ReturnType<typeof apiAs>;
let tags: ReturnType<typeof apiAs>;
let otherInbox: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUser();
    inbox = apiAs(userId, "/inbox", inboxRoutes);
    tasks = apiAs(userId, "/tasks", taskRoutes);
    projects = apiAs(userId, "/projects", projectRoutes);
    tags = apiAs(userId, "/tags", tagRoutes);
    otherInbox = apiAs(await createUser(), "/inbox", inboxRoutes);
});

async function capture(rawText: string, client = inbox) {
    const res = await client("POST", "", { rawText });
    expect(res.status).toBe(201);
    return res.body.data;
}

describe("capturing", () => {
    it("captures an item as unprocessed and lists it, newest first, for its owner only", async () => {
        const first = await capture("Buy groceries");
        await capture("Call the dentist");
        await capture("Theirs", otherInbox);

        const { body } = await inbox("GET", "");

        expect(first).toMatchObject({ rawText: "Buy groceries", processed: false });
        expect(body.data.map((i: any) => i.rawText)).toEqual(["Call the dentist", "Buy groceries"]);
    });

    it("rejects an invalid body with 400", async () => {
        expect((await inbox("POST", "", { rawText: "" })).status).toBe(400);
    });

    it("replays a retried capture with the same Idempotency-Key", async () => {
        const headers = { "Idempotency-Key": "capture-1" };

        const first = await inbox("POST", "", { rawText: "once" }, headers);
        const retry = await inbox("POST", "", { rawText: "once" }, headers);

        expect(retry.body.data.id).toBe(first.body.data.id);
        expect((await inbox("GET", "")).body.data).toHaveLength(1);
    });
});

describe("processing an item into a task", () => {
    it("creates the task from quick-add text and marks the item placed", async () => {
        const { body: project } = await projects("POST", "", { name: "Apollo" });
        const { body: tag } = await tags("POST", "", { name: "planning" });
        const item = await capture("Work on Apollo /apollo #planning 2026-03-09");

        const { status, body } = await inbox("POST", `/${item.id}/process`, { title: "Work on Apollo" });

        expect(status).toBe(201);
        expect(body.data).toMatchObject({ title: "Work on Apollo", projectId: project.data.id, dueDate: "2026-03-09T12:00:00.000Z", isAllDay: true });
        expect((await tasks("GET", `/${body.data.id}/tags`)).body.data.map((t: any) => t.id)).toEqual([tag.data.id]);
        const [placed] = await asOwner(async (pg) =>
            (await pg.query("SELECT capture_status, placed_task_id, processed, analysis_status FROM inbox_items WHERE id = $1", [item.id])).rows,
        );
        expect(placed).toEqual({ capture_status: "placed", placed_task_id: body.data.id, processed: true, analysis_status: "applied" });
        expect((await inbox("GET", "")).body.data).toEqual([]);
    });

    it("uses explicit fields over what the text implies", async () => {
        const item = await capture("dentist tomorrow p4");

        const { body } = await inbox("POST", `/${item.id}/process`, { title: "Dentist", dueDate: "2026-04-01", priority: 1 });

        expect(body.data).toMatchObject({ title: "Dentist", dueDate: "2026-04-01T12:00:00.000Z", priority: 1 });
    });

    it("replays a retried process call with the same Idempotency-Key as 200, without a second task", async () => {
        const item = await capture("once");
        const headers = { "Idempotency-Key": "process-1" };

        const first = await inbox("POST", `/${item.id}/process`, { title: "Once" }, headers);
        const retry = await inbox("POST", `/${item.id}/process`, { title: "Once" }, headers);

        expect([first.status, retry.status]).toEqual([201, 200]);
        expect(retry.body.data.id).toBe(first.body.data.id);
        expect((await tasks("GET", "")).body.data).toHaveLength(1);
    });

    it("returns the already-placed task when an item is processed again (regression: made a duplicate)", async () => {
        const item = await capture("twice");

        const first = await inbox("POST", `/${item.id}/process`, { title: "One" });
        const again = await inbox("POST", `/${item.id}/process`, { title: "Two" });

        expect(again.status).toBe(200);
        expect(again.body.data.id).toBe(first.body.data.id);
        expect((await tasks("GET", "")).body.data.map((t: any) => t.title)).toEqual(["One"]);
    });

    it("treats another user's item as not found and creates nothing", async () => {
        const theirs = await capture("theirs", otherInbox);

        expect((await inbox("POST", `/${theirs.id}/process`, { title: "Stolen" })).status).toBe(404);
        expect((await tasks("GET", "")).body.data).toEqual([]);
    });
});

describe("editing and deleting items", () => {
    it("updates only the sent fields", async () => {
        const item = await capture("draft");

        const { body } = await inbox("PATCH", `/${item.id}`, { captureKind: "thought" });

        expect(body.data).toMatchObject({ rawText: "draft", captureKind: "thought" });
    });

    it("deletes an item", async () => {
        const item = await capture("gone");

        expect((await inbox("DELETE", `/${item.id}`)).status).toBe(200);
        expect((await inbox("GET", "")).body.data).toEqual([]);
    });

    it("treats another user's item as not found for update and delete, and leaves it intact", async () => {
        const theirs = await capture("theirs", otherInbox);

        expect((await inbox("PATCH", `/${theirs.id}`, { rawText: "hijacked" })).status).toBe(404);
        expect((await inbox("DELETE", `/${theirs.id}`)).status).toBe(404);
        expect((await otherInbox("GET", "")).body.data.map((i: any) => i.rawText)).toEqual(["theirs"]);
    });
});

describe("inbox sections", () => {
    it("creates, lists by orderIndex, renames, and deletes sections", async () => {
        const { body: later } = await inbox("POST", "/sections", { name: "Later", orderIndex: 2 });
        await inbox("POST", "/sections", { name: "Now", orderIndex: 1 });

        expect((await inbox("GET", "/sections")).body.data.map((s: any) => s.name)).toEqual(["Now", "Later"]);
        expect((await inbox("PATCH", `/sections/${later.data.id}`, { name: "Someday" })).body.data).toMatchObject({ name: "Someday", orderIndex: 2 });
        expect((await inbox("DELETE", `/sections/${later.data.id}`)).status).toBe(200);
        expect((await inbox("GET", "/sections")).body.data.map((s: any) => s.name)).toEqual(["Now"]);
    });

    it("rejects an invalid body with 400", async () => {
        expect((await inbox("POST", "/sections", { name: "" })).status).toBe(400);
    });

    it("keeps an item when its section is deleted, moving it out of the section", async () => {
        const { body: section } = await inbox("POST", "/sections", { name: "S" });
        const { body: item } = await inbox("POST", "", { rawText: "filed", sectionId: section.data.id });

        await inbox("DELETE", `/sections/${section.data.id}`);

        const [kept] = (await inbox("GET", "")).body.data;
        expect(kept).toMatchObject({ id: item.data.id, sectionId: null });
    });

    it("refuses to file an item into another user's section (regression: was accepted)", async () => {
        const { body: theirs } = await otherInbox("POST", "/sections", { name: "Theirs" });
        const mine = await capture("mine");

        expect((await inbox("POST", "", { rawText: "x", sectionId: theirs.data.id })).status).toBe(404);
        expect((await inbox("PATCH", `/${mine.id}`, { sectionId: theirs.data.id })).status).toBe(404);
        expect((await inbox("GET", "")).body.data.map((i: any) => [i.rawText, i.sectionId])).toEqual([["mine", null]]);
    });

    it("treats another user's section as not found for rename and delete", async () => {
        const { body: theirs } = await otherInbox("POST", "/sections", { name: "Theirs" });

        expect((await inbox("PATCH", `/sections/${theirs.data.id}`, { name: "hijacked" })).status).toBe(404);
        expect((await inbox("DELETE", `/sections/${theirs.data.id}`)).status).toBe(404);
        expect((await otherInbox("GET", "/sections")).body.data.map((s: any) => s.name)).toEqual(["Theirs"]);
    });
});


describe("Capture exits", () => {
    it("keeps explicit no-day fields even when text has a date", async () => {
        const item = await capture("Water plants tomorrow at 3pm");
        const result = await inbox("POST", `/${item.id}/process`, { title: "Water plants", isAllDay: true, dueDate: null, scheduledStart: null, scheduledEnd: null });
        expect(result.status).toBe(201);
        expect(result.body.data).toMatchObject({ dueDate: null, scheduledStart: null, scheduledEnd: null, isAllDay: true });
    });
    it("ticks a thought off and atomically undoes it", async () => {
        const item = await capture("Buy milk tomorrow");
        const result = await inbox("POST", `/${item.id}/process`, { title: "Buy milk", complete: true });
        expect(result.status).toBe(201);
        expect(result.body.data).toMatchObject({ state: "COMPLETE", origin: "thought", dueDate: null });
        expect((await otherInbox("POST", `/${item.id}/unprocess`)).status).toBe(404);
        const restored = await inbox("POST", `/${item.id}/unprocess`);
        expect(restored.body.data).toMatchObject({ captureStatus: "clarifying", processed: false, placedTaskId: null });
        expect((await tasks("GET", `/${result.body.data.id}`)).body.data.state).toBe("ARCHIVED");
        expect((await inbox("GET", "")).body.data.map((row: any) => row.id)).toContain(item.id);
        expect((await inbox("POST", `/${item.id}/unprocess`)).status).toBe(200);
    });
    it("excludes discarded and kept items from the queue, with a separate notes read", async () => {
        const discarded = await capture("discard me");
        const kept = await capture("a note");
        const active = await capture("still new");
        await inbox("PATCH", `/${discarded.id}`, { captureStatus: "discarded" });
        await inbox("PATCH", `/${kept.id}`, { captureStatus: "kept" });
        expect((await inbox("GET", "")).body.data.map((i: any) => i.id)).toEqual([active.id]);
        expect((await inbox("GET", "?status=kept")).body.data.map((i: any) => i.id)).toEqual([kept.id]);
    });
    it("keeps a detected timestamp when the user chooses that suggestion", async () => {
        const item = await capture("Call the dentist tomorrow at 3pm");
        const result = await inbox("POST", `/${item.id}/process`, { title: "Call the dentist", scheduledDate: "2026-09-24T15:00:00-04:00" });
        expect(result.status).toBe(201);
        expect(new Date(result.body.data.scheduledStart).toISOString()).toBe("2026-09-24T19:00:00.000Z");
        expect(result.body.data.isAllDay).toBe(false);
    });

    it("orders equal timestamps by descending id", async () => {
        const a = await capture("A"); const b = await capture("B");
        await asOwner(async pg => { await pg.query("UPDATE inbox_items SET created_at = '2026-01-01' WHERE id IN ($1, $2)", [a.id, b.id]); });
        expect((await inbox("GET", "")).body.data.map((i: any) => i.id)).toEqual([a.id, b.id].sort().reverse());
    });
});
