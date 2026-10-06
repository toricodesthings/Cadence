import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { projectRoutes } from "../../src/domains/projects/projects.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { updateTask } from "../../src/domains/tasks/tasks.service";
import { withRls } from "../../src/platform/rls";

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

/** The caller's zone is the account's (`users.time_zone`). */
const setZone = (zone: string, id = userId) => asOwner((pg) => pg.query("UPDATE users SET time_zone = $2 WHERE id = $1", [id, zone]));

const titles = (list: any[]) => list.map((t) => t.title);

describe("creating tasks", () => {
    it("applies defaults on create", async () => {
        const task = await create({ title: "Write spec", dueDate: "2026-03-10" });

        expect(task).toMatchObject({ state: "ACTIVE", priority: 0, isAllDay: true, isPinned: false, projectId: null });
        expect(task.interactionMode).toEqual(expect.any(String));
    });

    it("stores a multi-day all-day task as a first and last LocalDate with no instants", async () => {
        const task = await create({ title: "Trip", dueDate: "2026-03-10", endDate: "2026-03-12" });

        expect(task).toMatchObject({ dueDate: "2026-03-10", endDate: "2026-03-12", scheduledStart: null, scheduledEnd: null, zone: null, isAllDay: true });
    });

    it("reads an old client's all-day shape (isAllDay + noon-UTC instant, end-of-day end) as the same days", async () => {
        const task = await create({ title: "Trip", isAllDay: true, dueDate: "2026-03-10T12:00:00.000Z", scheduledEnd: "2026-03-12T23:59:59.999Z" });

        expect(task).toMatchObject({ dueDate: "2026-03-10", endDate: "2026-03-12", scheduledStart: null, scheduledEnd: null, isAllDay: true });
    });

    it("resolves project, tag, and date from quick-add text and stores the parse", async () => {
        const { body: project } = await projects("POST", "", { name: "Apollo" });
        const { body: tag } = await tags("POST", "", { name: "planning" });

        const task = await create({
            title: "Work on Apollo",
            nlp: { rawInput: "Work on Apollo /apollo #planning 2026-03-09", sourceSurface: "quick_add", dateStyle: "mdy" },
        });

        expect(task).toMatchObject({ projectId: project.data.id, dueDate: "2026-03-09", isAllDay: true });
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

    it("keeps a client-chosen id, replays it once, and refuses one another account holds", async () => {
        const id = crypto.randomUUID();
        const headers = { "Idempotency-Key": id };

        const first = await tasks("POST", "", { id, title: "Offline", orderIndex: 1 }, headers);
        const replay = await tasks("POST", "", { id, title: "Offline", orderIndex: 1 }, headers);
        const theirs = await otherTasks("POST", "", { id, title: "Taken", orderIndex: 1 }, headers);

        expect(first.body.data.id).toBe(id);
        expect(replay.body.data.id).toBe(id);
        expect((await tasks("GET", "")).body.data).toHaveLength(1);
        expect(theirs.status).toBe(409);
        expect((await otherTasks("GET", "")).body.data).toEqual([]);
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
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502",
            interactionMode: "timetable",
        });

        const { body } = await tasks("GET", "?state=ACTIVE&from=2026-03-09&to=2026-03-15");

        expect(body.data.map((t: any) => [t.id, t.seriesId, t.isRecurringInstance])).toEqual([
            [`${series.id}::2026-03-10`, series.id, true],
            [`${series.id}::2026-03-12`, series.id, true],
        ]);
    });

    it("returns tasks anchored in a date window and series running into it, and nothing else", async () => {
        const timed = (start: string, extra: Record<string, unknown> = {}) => ({
            scheduledStart: start, scheduledEnd: start.replace("T09", "T10"), ...extra,
        });
        await create({ title: "W timed", ...timed("2027-05-12T09:00:00.000Z") });
        await create({ title: "W due", dueDate: "2027-05-13" });
        await create({ title: "W before", dueDate: "2027-05-01" });
        await create({ title: "W after", dueDate: "2027-05-20" });
        await create({ title: "W weekly", ...timed("2027-04-07T09:00:00.000Z", { recurrenceRule: "FREQ=WEEKLY" }) });
        await create({ title: "W starts later", ...timed("2027-06-01T09:00:00.000Z", { recurrenceRule: "FREQ=DAILY" }) });

        const { body } = await tasks("GET", "?state=ACTIVE&from=2027-05-10&to=2027-05-16");

        expect(titles(body.data).filter((title: string) => title.startsWith("W ")).sort()).toEqual(["W due", "W timed", "W weekly"]);
    });

    it("rejects half a range with a structured 400", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const { status, body } = await tasks("GET", "?from=2026-03-01");

        expect(status).toBe(400);
        expect(body.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: "to" })]));
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

        expect(body.data).toMatchObject({ isAllDay: true, dueDate: "2026-03-10", scheduledStart: null, scheduledEnd: null });
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
        expect((await tasks("GET", `/${task.id}`)).body.data.title).toBe("T2");
    });

    it("updates a simple field without reading first, matching the served version despite Postgres microseconds", async () => {
        const task = await create({ title: "T", priority: 3 });
        await asOwner((pg) => pg.query("UPDATE tasks SET updated_at = $1 WHERE id = $2", ["2026-03-10T09:00:00.123456Z", task.id]));
        const { body: fresh } = await tasks("GET", `/${task.id}`);
        expect(fresh.data.updatedAt).toBe("2026-03-10T09:00:00.123Z");

        await withRls(getTestDb(), userId, async (tx) => {
            const select = vi.spyOn(tx, "select");
            const updated = await updateTask(tx, userId, task.id, { priority: 4 }, "2026-03-10T05:00:00.123-04:00");
            expect(updated.priority).toBe(4);
            expect(select).not.toHaveBeenCalled();
        });
    });

    it("treats an invalid version string as a conflict and leaves the task intact", async () => {
        const task = await create({ title: "Original" });
        const { status, body } = await tasks("PATCH", `/${task.id}`, { title: "Changed", expectedUpdatedAt: "not-a-date" });
        expect(status).toBe(409);
        expect(body.error.code).toBe("CONFLICT");
        expect((await tasks("GET", `/${task.id}`)).body.data.title).toBe("Original");
    });

    it("allows only one of two clients editing the same version and preserves the winner", async () => {
        const task = await create({ title: "Original" });
        const expectedUpdatedAt = "2026-03-10T09:00:00.123Z";
        await asOwner((pg) => pg.query("UPDATE tasks SET updated_at = $1 WHERE id = $2", [expectedUpdatedAt, task.id]));
        const results = await Promise.all(["A", "B"].map((title) => tasks("PATCH", `/${task.id}`, { title, expectedUpdatedAt })));
        expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
        expect((await tasks("GET", `/${task.id}`)).body.data.title).toBe(results.find((result) => result.status === 200)!.body.data.title);
    });

    it("returns 404 for a versioned edit of a missing or another user's task", async () => {
        const theirs = await create({ title: "Theirs" }, otherTasks);
        const patch = { title: "Changed", expectedUpdatedAt: theirs.updatedAt };
        expect((await tasks("PATCH", `/${theirs.id}`, patch)).status).toBe(404);
        expect((await tasks("PATCH", `/${crypto.randomUUID()}`, patch)).status).toBe(404);
        expect((await otherTasks("GET", `/${theirs.id}`)).body.data.title).toBe("Theirs");
    });

    it("keeps stale-edit protection for schedule edits that still need the locked row", async () => {
        const task = await create({ title: "T", dueDate: "2026-03-10" });
        const { status, body } = await tasks("PATCH", `/${task.id}`, { dueDate: "2026-03-11", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" });
        expect(status).toBe(409);
        expect(body.error.code).toBe("CONFLICT");
        expect((await tasks("GET", `/${task.id}`)).body.data.dueDate).toBe("2026-03-10");
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
        for (const t of body.data) expect(t).toMatchObject({ dueDate: "2026-03-10", scheduledStart: null });
        const counts = await asOwner(async (pg) => (await pg.query("SELECT reschedule_count FROM task_metrics WHERE task_id = ANY($1)", [[a.id, b.id]])).rows);
        expect(counts).toEqual([{ reschedule_count: 1 }, { reschedule_count: 1 }]);
        expect((await otherTasks("GET", `/${theirs.id}`)).body.data.dueDate).toBe("2026-01-01");

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
        await setZone("America/Toronto");
        // 2:00 PM Friday in Toronto, an all-day Friday task, and a Fixed class.
        const call = await create({ title: "Call", scheduledStart: "2026-09-25T18:00:00.000Z", scheduledEnd: "2026-09-25T18:30:00.000Z" });
        const rent = await create({ title: "Rent", dueDate: "2026-09-25" });
        const lecture = await create({ title: "Lecture", scheduledStart: "2026-09-25T13:00:00.000Z", interactionMode: "timetable" });

        const { body } = await tasks("POST", "/batch/reschedule", {
            taskIds: [call.id, rent.id, lecture.id],
            date: "2026-09-28",
        });

        const byTitle = Object.fromEntries(body.data.map((t: any) => [t.title, t]));
        expect(byTitle.Call).toMatchObject({ isAllDay: false, scheduledStart: "2026-09-28T18:00:00.000Z", scheduledEnd: "2026-09-28T18:30:00.000Z" });
        expect(byTitle.Rent).toMatchObject({ isAllDay: true, dueDate: "2026-09-28", scheduledStart: null });
        expect(byTitle.Lecture).toBeUndefined(); // Fixed blocks stay put alongside other tasks
        expect((await tasks("POST", "/batch/reschedule", { taskIds: [lecture.id], date: "2026-09-28" })).body.data[0].scheduledStart)
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
    it("replaces the stored parse with the new one", async () => {
        const task = await create({ title: "T" });

        expect((await tasks("POST", `/${task.id}/reparse`, { rawInput: "call mom tomorrow" })).status).toBe(201);
        expect((await tasks("POST", `/${task.id}/reparse`, { rawInput: "call mom friday" })).status).toBe(201);

        const current = await asOwner(async (pg) => (await pg.query("SELECT raw_input FROM task_nlp_metadata WHERE task_id = $1", [task.id])).rows);
        expect(current).toEqual([{ raw_input: "call mom friday" }]);
    });
});

describe("reading and deleting", () => {
    it("deletes a task", async () => {
        const task = await create({ title: "Gone" });

        expect((await tasks("DELETE", `/${task.id}`)).status).toBe(200);
        expect((await tasks("GET", `/${task.id}`)).status).toBe(404);
    });

    it("empties Trash: only the caller's trashed tasks go", async () => {
        const [trashed, open] = [await create({ title: "Trashed" }), await create({ title: "Open" })];
        const theirs = await create({ title: "Theirs" }, otherTasks);
        await tasks("PATCH", "/batch/state", { taskIds: [trashed.id], state: "ARCHIVED" });
        await otherTasks("PATCH", "/batch/state", { taskIds: [theirs.id], state: "ARCHIVED" });

        const { status, body } = await tasks("DELETE", "/trash");

        expect(status).toBe(200);
        expect(body.data).toEqual({ deleted: 1 });
        expect((await tasks("GET", `/${trashed.id}`)).status).toBe(404);
        expect((await tasks("GET", `/${open.id}`)).status).toBe(200);
        expect((await otherTasks("GET", `/${theirs.id}`)).status).toBe(200);
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

describe("one time model (0.26.3)", () => {
    const onDay = async (day: string) => titles((await tasks("GET", `?state=ACTIVE&from=${day}&to=${day}`)).body.data);
    const localTime = (instant: string, zone: string) =>
        new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));

    it.each(["America/Toronto", "Pacific/Kiritimati", "UTC", "Pacific/Pago_Pago"])(
        "an all-day task due 2026-10-05 is on that day for a %s user, and on no neighbouring day (COMP3000 regression)",
        async (zone) => {
            await setZone(zone);
            await create({ title: "COMP3000", dueDate: "2026-10-05" });

            expect(await onDay("2026-10-05")).toEqual(["COMP3000"]);
            expect(await onDay("2026-10-04")).toEqual([]);
            expect(await onDay("2026-10-06")).toEqual([]);
            expect(titles((await tasks("GET", "?state=ACTIVE&from=2026-10-01&to=2026-10-31")).body.data)).toEqual(["COMP3000"]);
        },
    );

    it("a timed task at 23:30 local lands on its local day, not the UTC one", async () => {
        await setZone("America/Toronto");
        const task = await create({ title: "Late", scheduledStart: "2026-10-05T23:30:00-04:00", scheduledEnd: "2026-10-06T00:00:00-04:00" });

        expect(task).toMatchObject({ scheduledStart: "2026-10-06T03:30:00.000Z", zone: "America/Toronto", dueDate: null, isAllDay: false });
        expect(await onDay("2026-10-05")).toEqual(["Late"]);
        expect(await onDay("2026-10-06")).toEqual([]);
    });

    it("a timed task near midnight in Kiritimati (+14) sits on its local day", async () => {
        await setZone("Pacific/Kiritimati");
        await create({ title: "Early", scheduledStart: "2026-10-05T00:15:00+14:00" }); // 2026-10-04T10:15Z

        expect(await onDay("2026-10-05")).toEqual(["Early"]);
        expect(await onDay("2026-10-04")).toEqual([]);
    });

    it("a weekly 14:35 Toronto series keeps 14:35 local across the 2026-11-01 DST change", async () => {
        await setZone("America/Toronto");
        const series = await create({ title: "Weekly", scheduledStart: "2026-10-25T14:35:00-04:00", scheduledEnd: "2026-10-25T15:35:00-04:00", recurrenceRule: "FREQ=WEEKLY" });

        const { body } = await tasks("GET", "?state=ACTIVE&from=2026-10-25&to=2026-11-08");

        expect(body.data.map((t: any) => t.id)).toEqual([`${series.id}::2026-10-25`, `${series.id}::2026-11-01`, `${series.id}::2026-11-08`]);
        expect(body.data.map((t: any) => localTime(t.scheduledStart, "America/Toronto"))).toEqual(["14:35", "14:35", "14:35"]);
        // The UTC hour moves by one: that is the DST change, not drift.
        expect(body.data.map((t: any) => t.scheduledStart.slice(11, 16))).toEqual(["18:35", "19:35", "19:35"]);
    });

    describe("legacy write shapes", () => {
        it("an instant dueDate becomes the user's local day (2026-10-06T03:59Z is Oct 5 in Toronto)", async () => {
            await setZone("America/Toronto");

            const task = await create({ title: "Old client", dueDate: "2026-10-06T03:59:00.000Z" });

            expect(task).toMatchObject({ dueDate: "2026-10-05", scheduledStart: null, isAllDay: true });
        });

        it("isAllDay:true with a noon-UTC dueDate keeps that day", async () => {
            await setZone("America/Toronto");

            const task = await create({ title: "Old all-day", isAllDay: true, dueDate: "2026-10-05T12:00:00.000Z" });

            expect(task).toMatchObject({ dueDate: "2026-10-05", scheduledStart: null, isAllDay: true });
        });

        it("isAllDay:true with a start turns the start into its local day", async () => {
            await setZone("America/Toronto");

            const task = await create({ title: "Old all-day start", isAllDay: true, scheduledStart: "2026-10-06T03:59:00.000Z" });

            expect(task).toMatchObject({ dueDate: "2026-10-05", scheduledStart: null, zone: null });
        });

        it("a date-only scheduledStart is an all-day task on that day", async () => {
            const task = await create({ title: "Date-only start", scheduledStart: "2026-10-05" });

            expect(task).toMatchObject({ dueDate: "2026-10-05", scheduledStart: null, isAllDay: true });
        });

        it("an instant notBefore becomes the local day", async () => {
            await setZone("America/Toronto");

            const task = await create({ title: "Hidden", notBefore: "2026-10-06T03:59:00.000Z" });

            expect(task.notBefore).toBe("2026-10-05");
        });
    });

    it("moving a multi-day task's first day keeps its span", async () => {
        const task = await create({ title: "Trip", dueDate: "2026-10-05", endDate: "2026-10-07" });

        const { body } = await tasks("PATCH", `/${task.id}`, { dueDate: "2026-10-10" });

        expect(body.data).toMatchObject({ dueDate: "2026-10-10", endDate: "2026-10-12", scheduledStart: null });
    });

    it("rejects an end day before the first day", async () => {
        const { status } = await tasks("POST", "", { title: "Bad", orderIndex: 1, dueDate: "2026-10-05", endDate: "2026-10-04" });

        expect(status).toBe(400);
    });
});
