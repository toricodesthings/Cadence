import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { projectRoutes } from "../../src/domains/projects/projects.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

let userId: string;
let tasks: ReturnType<typeof apiAs>;
let projects: ReturnType<typeof apiAs>;
let tags: ReturnType<typeof apiAs>;
let otherTasks: ReturnType<typeof apiAs>;
let otherTags: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser();
    const otherId = await createUser();
    tasks = apiAs(userId, "/tasks", taskRoutes);
    projects = apiAs(userId, "/projects", projectRoutes);
    tags = apiAs(userId, "/tags", tagRoutes);
    otherTasks = apiAs(otherId, "/tasks", taskRoutes);
    otherTags = apiAs(otherId, "/tags", tagRoutes);
});

async function create(body: Record<string, unknown>, client = tasks) {
    const res = await client("POST", "", { orderIndex: 1, ...body });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data;
}

const titles = (list: any[]) => list.map((t) => t.title);

describe("creating tasks", () => {
    it("applies defaults on create", async () => {
        const task = await create({ title: "Write spec", dueDate: "2026-03-10" });

        expect(task).toMatchObject({ state: "ACTIVE", priority: 0, isAllDay: true, isPinned: false, projectId: null });
        expect(task.interactionMode).toEqual(expect.any(String));
    });

    it("normalizes an all-day duration to a noon anchor and an end-of-day end", async () => {
        const task = await create({ title: "Trip", isAllDay: true, dueDate: "2026-03-10", scheduledEnd: "2026-03-12" });

        expect(task).toMatchObject({
            dueDate: "2026-03-10T12:00:00.000Z",
            scheduledStart: null,
            scheduledEnd: "2026-03-12T23:59:59.999Z",
        });
    });

    it("resolves project, tag, and date from quick-add text and stores the parse", async () => {
        const { body: project } = await projects("POST", "", { name: "Apollo" });
        const { body: tag } = await tags("POST", "", { name: "planning" });

        const task = await create({
            title: "Work on Apollo",
            nlp: { rawInput: "Work on Apollo /apollo #planning 2026-03-09", sourceSurface: "quick_add", dateStyle: "mdy" },
        });

        expect(task).toMatchObject({ projectId: project.data.id, dueDate: "2026-03-09T12:00:00.000Z", isAllDay: true });
        expect((await tasks("GET", `/${task.id}/tags`)).body.data.map((t: any) => t.id)).toEqual([tag.data.id]);
        const [meta] = await asOwner(async (pg) => (await pg.query("SELECT source_surface, is_current FROM task_nlp_metadata WHERE task_id = $1", [task.id])).rows);
        expect(meta).toEqual({ source_surface: "quick_add", is_current: true });
    });

    it("rejects a malformed recurrence rule", async () => {
        const { status, body } = await tasks("POST", "", {
            title: "Broken",
            orderIndex: 1,
            isAllDay: false,
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=NOPE",
        });

        expect(status).toBe(400);
        expect(body.error.code).toBe("INVALID_RECURRENCE_RULE");
    });

    it("refuses another user's project or tag", async () => {
        const { body: theirTag } = await otherTags("POST", "", { name: "theirs" });
        const theirProject = (await apiAs((await createUser()), "/projects", projectRoutes)("POST", "", { name: "P" })).body.data;

        expect((await tasks("POST", "", { title: "x", orderIndex: 1, projectId: theirProject.id })).status).toBe(404);
        expect((await tasks("POST", "", { title: "x", orderIndex: 1, tagIds: [theirTag.data.id] })).status).toBe(404);
        expect((await tasks("GET", "")).body.data).toEqual([]);
    });

    it("replays a retried create with the same Idempotency-Key", async () => {
        const headers = { "Idempotency-Key": "task-create-1" };

        const first = await tasks("POST", "", { title: "Once", orderIndex: 1 }, headers);
        const retry = await tasks("POST", "", { title: "Once", orderIndex: 1 }, headers);

        expect(retry.body.data.id).toBe(first.body.data.id);
        expect((await tasks("GET", "")).body.data).toHaveLength(1);
    });
});

describe("listing tasks", () => {
    it("returns only the caller's tasks, pinned first then by orderIndex, with tagIds", async () => {
        const { body: tag } = await tags("POST", "", { name: "t" });
        await create({ title: "B", orderIndex: 2 });
        await create({ title: "A", orderIndex: 1, tagIds: [tag.data.id] });
        await create({ title: "Pinned", orderIndex: 9, isPinned: true });
        await create({ title: "Theirs" }, otherTasks);

        const { body } = await tasks("GET", "");

        expect(titles(body.data)).toEqual(["Pinned", "A", "B"]);
        expect(body.data.find((t: any) => t.title === "A").tagIds).toEqual([tag.data.id]);
    });

    it("filters by state, missing project, and overdue-or-today", async () => {
        const { body: project } = await projects("POST", "", { name: "P" });
        await create({ title: "Overdue", dueDate: "2026-03-01" });
        await create({ title: "Today", dueDate: "2026-03-09" });
        await create({ title: "Later", dueDate: "2026-03-20" });
        await create({ title: "Filed", dueDate: "2026-03-01", projectId: project.data.id });
        await create({ title: "Done", dueDate: "2026-03-01", state: "COMPLETE" });

        const { body } = await tasks("GET", "?state=ACTIVE&hasNoProject=true&effectiveOnOrBeforeDate=2026-03-09");

        expect(titles(body.data).sort()).toEqual(["Overdue", "Today"]);
    });

    it("expands a recurring series into one instance per occurrence inside the range", async () => {
        const series = await create({
            title: "Lecture",
            isAllDay: false,
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502T235959Z",
            interactionMode: "timetable",
        });

        const { body } = await tasks("GET", "?state=ACTIVE&scheduledRangeStart=2026-03-09&scheduledRangeEnd=2026-03-15");

        expect(body.data.map((t: any) => [t.id, t.seriesId, t.isRecurringInstance])).toEqual([
            [`${series.id}::2026-03-10T09:30:00.000Z`, series.id, true],
            [`${series.id}::2026-03-12T09:30:00.000Z`, series.id, true],
        ]);
    });

    it("rejects half a range with a structured 400", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const { status, body } = await tasks("GET", "?scheduledRangeStart=2026-03-01");

        expect(status).toBe(400);
        expect(body.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: "scheduledRangeEnd" })]));
    });
});

describe("updating tasks", () => {
    it("changes only the sent fields", async () => {
        const task = await create({ title: "T", priority: 3, isPinned: true });

        const { body } = await tasks("PATCH", `/${task.id}`, { effort: 2 });

        expect(body.data).toMatchObject({ effort: 2, priority: 3, isPinned: true, title: "T" });
    });

    it("answers every write and read with the task's tagIds", async () => {
        const { body: tag } = await tags("POST", "", { name: "t" });
        const task = await create({ title: "T", tagIds: [tag.data.id] });
        expect(task.tagIds).toEqual([tag.data.id]);

        expect((await tasks("PATCH", `/${task.id}`, { effort: 2 })).body.data.tagIds).toEqual([tag.data.id]);
        expect((await tasks("GET", `/${task.id}`)).body.data.tagIds).toEqual([tag.data.id]);
        expect((await tasks("PATCH", "/batch/state", { taskIds: [task.id], state: "COMPLETE" })).body.data[0].tagIds).toEqual([tag.data.id]);
    });

    it("moves a timed task to an all-day date the way the client sends it (clearing the time block)", async () => {
        const task = await create({ title: "T", isAllDay: false, scheduledStart: "2026-03-09T14:00:00.000Z", scheduledEnd: "2026-03-09T15:30:00.000Z" });

        const { body } = await tasks("PATCH", `/${task.id}`, { isAllDay: true, dueDate: "2026-03-10", scheduledStart: null, scheduledEnd: null });

        expect(body.data).toMatchObject({ isAllDay: true, dueDate: "2026-03-10T12:00:00.000Z", scheduledStart: null, scheduledEnd: null });
    });

    it("rejects an all-day move that leaves the old end time before the new day, instead of saving a broken span", async () => {
        const task = await create({ title: "T", isAllDay: false, scheduledStart: "2026-03-09T14:00:00.000Z", scheduledEnd: "2026-03-09T15:30:00.000Z" });

        const { status } = await tasks("PATCH", `/${task.id}`, { isAllDay: true, dueDate: "2026-03-10" });

        expect(status).toBe(400);
        expect((await tasks("GET", `/${task.id}`)).body.data.isAllDay).toBe(false);
    });

    it("accepts the updatedAt it just served as expectedUpdatedAt, and rejects a stale one with 409", async () => {
        const task = await create({ title: "T" });
        const { body: fresh } = await tasks("GET", `/${task.id}`);

        expect((await tasks("PATCH", `/${task.id}`, { title: "T2", expectedUpdatedAt: fresh.data.updatedAt })).status).toBe(200);
        expect((await tasks("PATCH", `/${task.id}`, { title: "T3", expectedUpdatedAt: fresh.data.updatedAt })).status).toBe(409);
    });

    it("reorders the whole list in one call, spacing indexes apart", async () => {
        const [a, b, c] = [await create({ title: "A" }), await create({ title: "B" }), await create({ title: "C" })];

        // Regression: this path returned 500 in production (untyped CASE branches resolved to text).
        const { status } = await tasks("PATCH", `/${b.id}/reorder`, { orderIndex: 0, orderedTaskIds: [c.id, a.id, b.id] });

        expect(status).toBe(200);
        const listed = (await tasks("GET", "")).body.data;
        expect(titles(listed)).toEqual(["C", "A", "B"]);
        expect(new Set(listed.map((t: any) => t.orderIndex)).size).toBe(3);
    });
});

describe("batch operations", () => {
    it("reschedules many tasks at once, recording a reschedule for each, and skips other users' tasks", async () => {
        const [a, b] = [await create({ title: "A" }), await create({ title: "B" })];
        const theirs = await create({ title: "Theirs", dueDate: "2026-01-01" }, otherTasks);

        const { body } = await tasks("POST", "/batch/reschedule", { taskIds: [a.id, b.id, theirs.id], scheduledStart: "2026-03-10", isAllDay: true });

        expect(titles(body.data).sort()).toEqual(["A", "B"]);
        for (const t of body.data) expect(t).toMatchObject({ dueDate: "2026-03-10T12:00:00.000Z", scheduledStart: null });
        const counts = await asOwner(async (pg) => (await pg.query("SELECT reschedule_count FROM task_metrics WHERE task_id = ANY($1)", [[a.id, b.id]])).rows);
        expect(counts).toEqual([{ reschedule_count: 1 }, { reschedule_count: 1 }]);
        expect((await otherTasks("GET", `/${theirs.id}`)).body.data.dueDate).toBe("2026-01-01T12:00:00.000Z");

        // Later writes update each task's one metrics row instead of adding another.
        await tasks("POST", "/batch/reschedule", { taskIds: [a.id, b.id], scheduledStart: "2026-03-11", isAllDay: true });
        await tasks("PATCH", "/batch/state", { taskIds: [a.id], state: "COMPLETE" });
        const rows = await asOwner(async (pg) => (await pg.query(
            "SELECT reschedule_count, first_scheduled IS NOT NULL AS has_first, completed_at IS NOT NULL AS done FROM task_metrics WHERE task_id = ANY($1) ORDER BY done DESC",
            [[a.id, b.id]],
        )).rows);
        expect(rows).toEqual([
            { reschedule_count: 2, has_first: true, done: true },
            { reschedule_count: 2, has_first: true, done: false },
        ]);
    });

    it("moves tasks to a local date keeping each one's time: timed stays 2 PM local, all-day stays all-day", async () => {
        // 2:00 PM Friday in Toronto, an all-day Friday task, and a Fixed class.
        const call = await create({ title: "Call", isAllDay: false, scheduledStart: "2026-09-25T18:00:00.000Z", scheduledEnd: "2026-09-25T18:30:00.000Z" });
        const rent = await create({ title: "Rent", dueDate: "2026-09-25" });
        const lecture = await create({ title: "Lecture", isAllDay: false, scheduledStart: "2026-09-25T13:00:00.000Z", interactionMode: "timetable" });

        const { body } = await tasks("POST", "/batch/reschedule", {
            taskIds: [call.id, rent.id, lecture.id],
            date: "2026-09-28",
            timezone: "America/Toronto",
        });

        const byTitle = Object.fromEntries(body.data.map((t: any) => [t.title, t]));
        expect(byTitle.Call).toMatchObject({ isAllDay: false, scheduledStart: "2026-09-28T18:00:00.000Z", scheduledEnd: "2026-09-28T18:30:00.000Z" });
        expect(byTitle.Rent).toMatchObject({ isAllDay: true, dueDate: "2026-09-28T12:00:00.000Z", scheduledStart: null });
        expect(byTitle.Lecture).toBeUndefined(); // Fixed blocks stay put alongside other tasks
        expect((await tasks("POST", "/batch/reschedule", { taskIds: [lecture.id], date: "2026-09-28", timezone: "America/Toronto" })).body.data[0].scheduledStart)
            .toBe("2026-09-28T13:00:00.000Z");
    });

    it("completes many tasks at once, recording completion, and skips other users' tasks", async () => {
        const [a, b] = [await create({ title: "A" }), await create({ title: "B" })];
        const theirs = await create({ title: "Theirs" }, otherTasks);

        const { body } = await tasks("PATCH", "/batch/state", { taskIds: [a.id, b.id, theirs.id], state: "COMPLETE" });

        expect(body.data.map((t: any) => t.state)).toEqual(["COMPLETE", "COMPLETE"]);
        const done = await asOwner(async (pg) => (await pg.query<{ n: number }>("SELECT count(*)::int n FROM task_metrics WHERE task_id = ANY($1) AND completed_at IS NOT NULL", [[a.id, b.id]])).rows[0].n);
        expect(done).toBe(2);
        expect((await otherTasks("GET", `/${theirs.id}`)).body.data.state).toBe("ACTIVE");
    });

    it("permanently deletes many tasks at once and skips other users' tasks", async () => {
        const [a, b] = [await create({ title: "A" }), await create({ title: "B" })];
        const theirs = await create({ title: "Theirs" }, otherTasks);

        const { body } = await tasks("POST", "/batch/delete", { taskIds: [a.id, b.id, theirs.id] });

        expect(titles(body.data).sort()).toEqual(["A", "B"]);
        expect((await tasks("GET", `/${a.id}`)).status).toBe(404);
        expect((await otherTasks("GET", `/${theirs.id}`)).status).toBe(200);
    });
});

describe("listing tasks", () => {
    it("returns every open task when no limit is sent", async () => {
        await asOwner((pg) => pg.query(
            "INSERT INTO tasks (user_id, title, order_index) SELECT $1, 'T' || n, n FROM generate_series(1, 60) n", [userId]));

        expect((await tasks("GET", "?state=ACTIVE")).body.data).toHaveLength(60);
    });

    it("pages Done newest first", async () => {
        const [a, b] = [await create({ title: "A" }), await create({ title: "B" })];
        await tasks("PATCH", "/batch/state", { taskIds: [b.id], state: "COMPLETE" });
        await tasks("PATCH", "/batch/state", { taskIds: [a.id], state: "COMPLETE" });

        expect(titles((await tasks("GET", "?state=COMPLETE&limit=1")).body.data)).toEqual(["A"]);
    });
});

describe("duplicating tasks", () => {
    it("copies the task and its tags as a new, unpinned, active task", async () => {
        const { body: tag } = await tags("POST", "", { name: "t" });
        const original = await create({ title: "Report", priority: 2, isPinned: true, state: "WAITING", tagIds: [tag.data.id] });

        const { status, body } = await tasks("POST", `/${original.id}/duplicate`);

        expect(status).toBe(201);
        expect(body.data).toMatchObject({ title: "Report (copy)", priority: 2, isPinned: false, state: "ACTIVE" });
        expect(body.data.id).not.toBe(original.id);
        expect((await tasks("GET", `/${body.data.id}/tags`)).body.data.map((t: any) => t.id)).toEqual([tag.data.id]);
    });
});

describe("task tags", () => {
    it("adds, lists, and removes a tag", async () => {
        const task = await create({ title: "T" });
        const { body: tag } = await tags("POST", "", { name: "t" });

        expect((await tasks("POST", `/${task.id}/tags`, { tagId: tag.data.id })).status).toBe(201);
        expect((await tasks("GET", `/${task.id}/tags`)).body.data.map((t: any) => t.name)).toEqual(["t"]);
        expect((await tasks("DELETE", `/${task.id}/tags/${tag.data.id}`)).status).toBe(200);
        expect((await tasks("GET", `/${task.id}/tags`)).body.data).toEqual([]);
    });

    it("treats attaching an already-attached tag as a no-op (regression: was a retryable 500)", async () => {
        const task = await create({ title: "T" });
        const { body: tag } = await tags("POST", "", { name: "t" });

        const first = await tasks("POST", `/${task.id}/tags`, { tagId: tag.data.id });
        const again = await tasks("POST", `/${task.id}/tags`, { tagId: tag.data.id });

        expect(again.status).toBe(201);
        expect(again.body.data.id).toBe(first.body.data.id);
        expect((await tasks("GET", `/${task.id}/tags`)).body.data).toHaveLength(1);
    });

    it("refuses to attach another user's tag", async () => {
        const task = await create({ title: "T" });
        const { body: theirs } = await otherTags("POST", "", { name: "theirs" });

        expect((await tasks("POST", `/${task.id}/tags`, { tagId: theirs.data.id })).status).toBe(404);
    });

    it("answers 404 when removing a tag that is not attached", async () => {
        const task = await create({ title: "T" });
        const { body: tag } = await tags("POST", "", { name: "t" });

        expect((await tasks("DELETE", `/${task.id}/tags/${tag.data.id}`)).status).toBe(404);
    });
});

describe("reparsing quick-add text", () => {
    it("stores the new parse as current and keeps the previous one in history", async () => {
        const task = await create({ title: "T" });

        expect((await tasks("POST", `/${task.id}/reparse`, { rawInput: "call mom tomorrow" })).status).toBe(201);
        expect((await tasks("POST", `/${task.id}/reparse`, { rawInput: "call mom friday" })).status).toBe(201);

        const [current, history] = await asOwner(async (pg) => [
            (await pg.query("SELECT raw_input FROM task_nlp_metadata WHERE task_id = $1", [task.id])).rows,
            (await pg.query("SELECT raw_input FROM task_nlp_metadata_history WHERE task_id = $1", [task.id])).rows,
        ]);
        expect(current).toEqual([{ raw_input: "call mom friday" }]);
        expect(history).toEqual([{ raw_input: "call mom tomorrow" }]);
    });
});

describe("reading and deleting", () => {
    it("deletes a task", async () => {
        const task = await create({ title: "Gone" });

        expect((await tasks("DELETE", `/${task.id}`)).status).toBe(200);
        expect((await tasks("GET", `/${task.id}`)).status).toBe(404);
    });

    it("treats another user's task as not found everywhere, and leaves it intact", async () => {
        const theirs = await create({ title: "Theirs" }, otherTasks);
        const id = theirs.id;

        for (const [method, path, body] of [
            ["GET", `/${id}`],
            ["PATCH", `/${id}`, { title: "hijacked" }],
            ["DELETE", `/${id}`],
            ["POST", `/${id}/duplicate`],
            ["GET", `/${id}/tags`],
            ["POST", `/${id}/reparse`, { rawInput: "x" }],
        ] as const) {
            expect((await tasks(method, path, body)).status, `${method} ${path}`).toBe(404);
        }
        expect((await otherTasks("GET", `/${id}`)).body.data.title).toBe("Theirs");
    });
});
