import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskBatch } from "@cadence/contracts/task";
import { apiAs } from "../helpers/app";
import { createUser, getTestDb, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";

let userId: string;
let tasks: ReturnType<typeof apiAs>;
let foreign: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser();
    tasks = apiAs(userId, "/tasks", taskRoutes);
    foreign = apiAs(await createUser(), "/tasks", taskRoutes);
});

async function create(input: Record<string, unknown>, client = tasks) {
    const result = await client("POST", "", { title: "Task", orderIndex: 1, ...input });
    expect(result.status).toBe(201);
    return result.body.data as Task;
}

const batchPath = (queries: unknown) => `/batch?queries=${encodeURIComponent(JSON.stringify(queries))}`;
const unpack = (batch: TaskBatch) => batch.lists.map((indices) => indices.map((index) => batch.tasks[index]));

describe("batched open task reads", () => {
    it("matches individual reads for overlapping lists, tags, filters and recurring schedule windows", async () => {
        const project = (await apiAs(userId, "/projects", projectRoutes)("POST", "", { name: "List" })).body.data;
        const tag = (await apiAs(userId, "/tags", tagRoutes)("POST", "", { name: "Tagged" })).body.data;
        await create({ title: "Capture", tagIds: [tag.id], orderIndex: 2 });
        await create({ title: "Due", dueDate: "2026-03-09", isPinned: true, priority: 4 });
        await create({ title: "Later", dueDate: "2026-04-10", projectId: project.id });
        await create({ title: "Waiting", state: "WAITING", effort: 2 });
        await create({ title: "Done", state: "COMPLETE" });
        await create({ title: "Trash", state: "ARCHIVED" });
        await create({ title: "Other account" }, foreign);
        await create({ title: "Fixed", isAllDay: false, scheduledStart: "2026-03-01T09:00:00.000Z",
            scheduledEnd: "2026-03-01T10:00:00.000Z", recurrenceRule: "FREQ=DAILY;COUNT=30", interactionMode: "timetable" });
        const queries: Record<string, string>[] = [
            { state: "ACTIVE" }, { state: "WAITING" },
            { state: "ACTIVE", hasNoDate: "true", hasNoProject: "true" },
            { state: "ACTIVE", effectiveOnOrBeforeDate: "2026-03-09" },
            { state: "ACTIVE", scheduledRangeStart: "2026-03-09", scheduledRangeEnd: "2026-03-15" },
            { state: "ACTIVE", scheduledRangeStart: "2026-03-12", scheduledRangeEnd: "2026-03-18" },
            { state: "ACTIVE", priority: "4", isPinned: "true" },
            { state: "ACTIVE", projectId: project.id },
            { state: "WAITING", effort: "2" },
            { state: "ACTIVE", scheduledDate: "2026-03-09" },
        ];
        const singles = [];
        for (const query of queries) singles.push((await tasks("GET", `?${new URLSearchParams(query)}`)).body.data);
        const { status, body, response } = await tasks("GET", batchPath(queries));
        expect(status, JSON.stringify(body)).toBe(200);
        expect(unpack(body.data)).toEqual(singles);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(body.data.tasks.length).toBeLessThan(singles.flat().length);
        expect(JSON.stringify(body.data).length).toBeLessThan(JSON.stringify(singles).length);
        expect(new Set(body.data.tasks.map((task: Task) => task.id)).size).toBe(body.data.tasks.length);
        expect(body.data.tasks.find((task: Task) => task.title === "Capture").tagIds).toEqual([tag.id]);
        expect(body.data.tasks.some((task: Task) => ["Other account", "Done", "Trash"].includes(task.title))).toBe(false);
    });

    it("performs one task+tag read in one RLS transaction for nine lists", async () => {
        await create({ title: "Open" });
        const db = getTestDb();
        const original = db.transaction.bind(db);
        const reads = vi.fn();
        const transactions = vi.spyOn(db, "transaction").mockImplementation(async (callback: any) => original(async (tx: any) => {
            const findMany = tx.query.tasks.findMany.bind(tx.query.tasks);
            tx.query.tasks.findMany = (...args: any[]) => { reads(); return findMany(...args); };
            return callback(tx);
        }));
        try {
            const result = await tasks("GET", batchPath(Array.from({ length: 9 }, () => ({ state: "ACTIVE" }))));
            expect(result.status).toBe(200);
            expect(transactions).toHaveBeenCalledTimes(1);
            expect(reads).toHaveBeenCalledTimes(1);
            expect(result.body.data.tasks).toHaveLength(1);
            expect(result.body.data.lists).toEqual(Array.from({ length: 9 }, () => [0]));
        } finally { transactions.mockRestore(); }
    });

    it("keeps full open lists while each schedule window retains the single-read cap", async () => {
        // Direct SQL seeding avoids testing create 60 times; reads still run with real RLS.
        const { asOwner } = await import("../helpers/db");
        await asOwner((pg) => pg.query(`INSERT INTO tasks (user_id, title, order_index, due_date)
            SELECT $1, 'Task ' || n, n, '2026-03-09T12:00:00Z'::timestamptz FROM generate_series(1, 60) n`, [userId]));
        const result = await tasks("GET", batchPath([{ state: "ACTIVE" }, { state: "ACTIVE", scheduledDate: "2026-03-09" }]));
        expect(result.status).toBe(200);
        expect(result.body.data.lists.map((list: number[]) => list.length)).toEqual([60, 50]);
    });
});
