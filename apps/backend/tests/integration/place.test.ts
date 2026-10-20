/** POST /tasks/place: Fit today's one write for a whole day, and its Undo. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { taskRoutes } from "../../src/domains/tasks/tasks.route";

const ZONE = "America/Toronto";
let userId: string;
let tasks: ReturnType<typeof apiAs>;

const sql = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => asOwner(async (pg) => (await pg.query<T>(text, params)).rows);
const make = async (title: string, extra: Record<string, unknown> = {}) => (await tasks("POST", "", { title, orderIndex: 1, dueDate: "2026-10-20", ...extra })).body.data;
const item = (task: any, start: string, end: string) => ({ id: task.id, scheduledStart: start, scheduledEnd: end, dueDate: null, endDate: null, expectedUpdatedAt: task.updatedAt });

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser({ zone: ZONE });
    tasks = apiAs(userId, "/tasks", taskRoutes);
});

describe("POST /tasks/place", () => {
    it("places every task in one write and Undo puts each back from `previous`", async () => {
        const a = await make("Essay");
        const b = await make("Email");
        const res = await tasks("POST", "/place", { items: [item(a, "2026-10-20T13:00:00.000Z", "2026-10-20T14:00:00.000Z"), item(b, "2026-10-20T14:15:00.000Z", "2026-10-20T14:45:00.000Z")] });
        expect(res.status).toBe(200);
        expect(res.body.data.tasks.map((t: any) => [t.id, t.scheduledStart, t.dueDate])).toEqual([[a.id, "2026-10-20T13:00:00.000Z", null], [b.id, "2026-10-20T14:15:00.000Z", null]]);
        expect(res.body.data.previous).toContainEqual({ id: a.id, scheduledStart: null, scheduledEnd: null, dueDate: "2026-10-20", endDate: null, zone: a.zone });

        const now = new Map(res.body.data.tasks.map((t: any) => [t.id, t.updatedAt]));
        const undo = await tasks("POST", "/place", { items: res.body.data.previous.map((p: any) => ({ ...p, expectedUpdatedAt: now.get(p.id) })) });
        expect(undo.status).toBe(200);
        const back = (await tasks("GET", `/${a.id}`)).body.data;
        expect(back).toMatchObject({ scheduledStart: null, scheduledEnd: null, dueDate: "2026-10-20" });
    });

    it("is all or nothing: one changed task is a 409 naming it, and nothing is written", async () => {
        const a = await make("Essay");
        const b = await make("Email");
        await tasks("PATCH", `/${b.id}`, { title: "Email Sam" });
        const res = await tasks("POST", "/place", { items: [item(a, "2026-10-20T13:00:00.000Z", "2026-10-20T14:00:00.000Z"), item(b, "2026-10-20T15:00:00.000Z", "2026-10-20T16:00:00.000Z")] });
        expect(res.status).toBe(409);
        expect(res.body.error.issues.map((i: any) => i.path)).toEqual([b.id]);
        expect((await tasks("GET", `/${a.id}`)).body.data.scheduledStart).toBeNull();
    });

    it("answers 404 for another person's task and writes nothing", async () => {
        const mine = await make("Mine");
        const otherId = await createUser({ zone: ZONE });
        const theirs = (await apiAs(otherId, "/tasks", taskRoutes)("POST", "", { title: "Theirs", orderIndex: 1 })).body.data;
        const res = await tasks("POST", "/place", { items: [item(mine, "2026-10-20T13:00:00.000Z", "2026-10-20T14:00:00.000Z"), item(theirs, "2026-10-20T15:00:00.000Z", "2026-10-20T16:00:00.000Z")] });
        expect(res.status).toBe(404);
        expect((await tasks("GET", `/${mine.id}`)).body.data.scheduledStart).toBeNull();
    });

    it("refuses done, Fixed and repeating tasks, and more than 50 items", async () => {
        const at = ["2026-10-20T13:00:00.000Z", "2026-10-20T14:00:00.000Z"] as const;
        for (const extra of [{ state: "COMPLETE" }, { interactionMode: "timetable" }, { recurrenceRule: "FREQ=DAILY" }]) {
            const t = await make("No", extra);
            expect((await tasks("POST", "/place", { items: [item(t, ...at)] })).status).toBe(400);
        }
        const t = await make("Many");
        expect((await tasks("POST", "/place", { items: Array.from({ length: 51 }, () => item(t, ...at)) })).status).toBe(400);
    });

    it("writes no slot record or reschedule signal, and replays a repeated Idempotency-Key", async () => {
        const a = await make("Essay");
        const body = { items: [item(a, "2026-10-20T13:00:00.000Z", "2026-10-20T14:00:00.000Z")] };
        const key = { "Idempotency-Key": crypto.randomUUID() };
        expect((await tasks("POST", "/place", body, key)).status).toBe(200);
        // The same request again: the stored answer, not a 409 for the version it already changed.
        expect((await tasks("POST", "/place", body, key)).status).toBe(200);
        expect(await sql("SELECT 1 FROM planning_records WHERE user_id = $1", [userId])).toHaveLength(0);
        expect(await sql("SELECT 1 FROM ai_memory_signals WHERE user_id = $1", [userId])).toHaveLength(0);
    });
});
