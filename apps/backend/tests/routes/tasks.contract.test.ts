import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/lib/request-log";
import type { AuthVariables } from "../../src/lib/auth";

const {
    getDbClientMock,
    withRlsMock,
    trackRescheduleMock,
    trackCompletionMock,
} = vi.hoisted(() => ({
    getDbClientMock: vi.fn(),
    withRlsMock: vi.fn(),
    trackRescheduleMock: vi.fn().mockResolvedValue(undefined),
    trackCompletionMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/lib/db", () => ({
    getDbClient: getDbClientMock,
}));

vi.mock("../../src/lib/rls", () => ({
    withRls: withRlsMock,
}));

vi.mock("../../src/lib/metrics", () => ({
    trackReschedule: trackRescheduleMock,
    trackCompletion: trackCompletionMock,
}));

import { taskRoutes } from "../../src/routes/tasks";

function createExecutionContext() {
    return {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;
}

function createTaskApp() {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use("*", createRequestContext());
    app.use("*", async (c, next) => {
        c.set("userId", "11111111-1111-4111-8111-111111111111");
        await next();
    });
    app.route("/tasks", taskRoutes as any);
    return app;
}

function createFindManyDb(result: unknown[]) {
    return {
        query: {
            tasks: {
                findMany: vi.fn().mockResolvedValue(result),
            },
        },
    };
}

function createInsertTx(insertedRow: Record<string, unknown>, capture: { values?: Record<string, unknown> }) {
    return {
        insert: vi.fn(() => ({
            values: vi.fn((values) => {
                capture.values = values;
                return {
                    returning: vi.fn().mockResolvedValue([insertedRow]),
                };
            }),
        })),
    };
}

function createUpdateTx(updatedRows: unknown[], capture: { set?: Record<string, unknown> }) {
    return {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn().mockResolvedValue([
                    {
                        id: "11111111-1111-4111-8111-111111111111",
                        isAllDay: false,
                        dueDate: null,
                        scheduledStart: "2026-03-09T14:00:00.000Z",
                        scheduledEnd: "2026-03-09T15:30:00.000Z",
                    },
                ]),
            })),
        })),
        update: vi.fn(() => ({
            set: vi.fn((values) => {
                capture.set = values;
                return {
                    where: vi.fn(() => ({
                        returning: vi.fn().mockResolvedValue(updatedRows),
                    })),
                };
            }),
        })),
    };
}

describe("task route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("accepts frontend month schedule queries and returns mapped tagIds", async () => {
        const db = createFindManyDb([
            {
                id: "task-1",
                userId: "user-1",
                title: "Calendar item",
                state: "ACTIVE",
                orderIndex: 1,
                isAllDay: true,
                dueDate: "2026-03-09T00:00:00.000Z",
                scheduledStart: null,
                scheduledEnd: null,
                durationEstimate: null,
                timezoneLocked: false,
                priority: 0,
                isPinned: false,
                reminderAt: null,
                reminderSilenced: false,
                recurrenceRule: null,
                waitingOn: null,
                waitingReminder: null,
                effort: null,
                notBefore: null,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
                projectId: null,
                sectionId: null,
                content: null,
                tags: [{ tagId: "tag-1" }],
            },
        ]);

        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(db));

        const app = createTaskApp();
        const response = await app.request(
            "http://localhost/tasks?state=ACTIVE&scheduledRangeStart=2026-03-01&scheduledRangeEnd=2026-03-31",
            {
                headers: {
                    "x-request-id": "req-schedule",
                },
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("x-request-id")).toBe("req-schedule");
        expect(response.headers.get("x-task-read-compatibility")).toContain("legacy_all_day_with_start");

        const body = await response.json() as any;
        expect(body.data[0].tagIds).toEqual(["tag-1"]);
        expect(db.query.tasks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 50,
                offset: 0,
            }),
        );
    });

    it("accepts the Today/Holding frontend filters together", async () => {
        const db = createFindManyDb([]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(db));

        const app = createTaskApp();
        const response = await app.request(
            "http://localhost/tasks?state=ACTIVE&hasNoProject=true&effectiveOnOrBeforeDate=2026-03-09",
        );

        expect(response.status).toBe(200);
        expect(db.query.tasks.findMany).toHaveBeenCalledTimes(1);
    });

    it("rejects malformed partial range filters with structured errors", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const app = createTaskApp();
        const response = await app.request("http://localhost/tasks?scheduledRangeStart=2026-03-01", {
            headers: {
                "x-request-id": "req-invalid-range",
            },
        });

        expect(response.status).toBe(400);
        expect(getDbClientMock).not.toHaveBeenCalled();

        const body = await response.json() as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
        expect(body.error.requestId).toBe("req-invalid-range");
        expect(body.error.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "scheduledRangeEnd",
                }),
            ]),
        );
        expect(warnSpy).toHaveBeenCalled();
    });

    it("normalizes frontend all-day duration task creation payloads", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const insertedRow = { id: "task-created" };
        const tx = createInsertTx(insertedRow, capture);

        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createTaskApp();
        const response = await app.request("http://localhost/tasks", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                title: "Trip",
                orderIndex: 1,
                isAllDay: true,
                dueDate: "2026-03-10",
                scheduledEnd: "2026-03-12",
            }),
        });

        expect(response.status).toBe(201);
        expect(capture.values).toMatchObject({
            dueDate: "2026-03-10T00:00:00.000Z",
            scheduledStart: null,
            scheduledEnd: "2026-03-12T23:59:59.999Z",
            isAllDay: true,
        });
    });

    it("normalizes all-day reschedules from the frontend and clears timed fields", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx(
            [
                {
                    id: "task-1",
                    dueDate: "2026-03-10T00:00:00.000Z",
                    scheduledStart: null,
                    scheduledEnd: null,
                    isAllDay: true,
                },
            ],
            capture,
        );

        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createTaskApp();
        const executionCtx = createExecutionContext();
        const response = await app.fetch(
            new Request("http://localhost/tasks/batch/reschedule", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    taskIds: ["11111111-1111-4111-8111-111111111111"],
                    scheduledStart: "2026-03-10",
                    isAllDay: true,
                }),
            }),
            {},
            executionCtx,
        );

        expect(response.status).toBe(200);
        expect(capture.set).toMatchObject({
            dueDate: "2026-03-10T00:00:00.000Z",
            scheduledStart: null,
            scheduledEnd: null,
            isAllDay: true,
        });
        expect(trackRescheduleMock).toHaveBeenCalledWith(
            tx,
            "11111111-1111-4111-8111-111111111111",
            "11111111-1111-4111-8111-111111111111",
            "2026-03-10T00:00:00.000Z",
        );
        expect((executionCtx.waitUntil as any)).toHaveBeenCalledTimes(1);
    });

    it("preserves unrelated fields during partial task patches from the frontend", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx(
            [
                {
                    id: "11111111-1111-4111-8111-111111111111",
                    effort: 2,
                    priority: 3,
                    isPinned: true,
                    isAllDay: false,
                    dueDate: null,
                    scheduledStart: "2026-03-09T14:00:00.000Z",
                    scheduledEnd: "2026-03-09T15:30:00.000Z",
                },
            ],
            capture,
        );

        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createTaskApp();
        const response = await app.request("http://localhost/tasks/11111111-1111-4111-8111-111111111111", {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                effort: 2,
            }),
        });

        expect(response.status).toBe(200);
        expect(capture.set).toMatchObject({
            effort: 2,
        });
        expect(capture.set).not.toHaveProperty("priority");
        expect(capture.set).not.toHaveProperty("isPinned");
    });
});
