import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/platform/request-log";
import type { AuthVariables } from "../../src/platform/auth";
import { formatErrorResponse } from "../../src/platform/errors";
import { tasks as tasksTable, taskTags as taskTagsTable, taskNlpMetadata as taskNlpMetadataTable } from "../../src/db/schema";

const {
    getDbClientMock,
    withRlsMock,
    trackRescheduleMock,
    trackCompletionMock,
    trackEventMock,
    trackBatchEventsMock,
    trackBatchCompletionMock,
} = vi.hoisted(() => ({
    getDbClientMock: vi.fn(),
    withRlsMock: vi.fn(),
    trackRescheduleMock: vi.fn().mockResolvedValue(undefined),
    trackCompletionMock: vi.fn().mockResolvedValue(undefined),
    trackEventMock: vi.fn().mockResolvedValue(undefined),
    trackBatchEventsMock: vi.fn().mockResolvedValue(undefined),
    trackBatchCompletionMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/platform/db", () => ({
    getDbClient: getDbClientMock,
}));

vi.mock("../../src/platform/rls", () => ({
    withRls: withRlsMock,
}));

vi.mock("../../src/platform/metrics", () => ({
    trackReschedule: trackRescheduleMock,
    trackCompletion: trackCompletionMock,
    trackEvent: trackEventMock,
    trackBatchEvents: trackBatchEventsMock,
    trackBatchCompletion: trackBatchCompletionMock,
}));

import { taskRoutes } from "../../src/domains/tasks/tasks.route";

function createExecutionContext() {
    return {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;
}

function createTaskApp() {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.onError((err, c) => {
        const res = formatErrorResponse(err);
        return c.json(res.body, res.status as 500);
    });
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

function createNlpCreateTx(capture: {
    taskValues?: Record<string, unknown>;
    tagValues?: Record<string, unknown>[];
    metadataValues?: Record<string, unknown>;
}) {
    const settingsRow = {
        settings: {
            dateTime: { dateStyle: "mdy" },
            tasks: { intelligence: { confidenceThreshold: "medium", dismissedEntityIds: [] } },
        },
    };
    const projectRows = [{ id: "proj-1", name: "Apollo" }];
    const tagRows = [{ id: "tag-1", name: "planning" }];

    const makeWherePromise = (result: unknown[]) => Promise.resolve(result);
    const makeLimited = (result: unknown[]) => ({
        limit: vi.fn().mockResolvedValue(result),
    });

    return {
        select: vi.fn()
            .mockImplementationOnce(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => makeLimited([settingsRow])),
                })),
            }))
            .mockImplementationOnce(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => makeWherePromise(projectRows)),
                })),
            }))
            .mockImplementationOnce(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => makeWherePromise(tagRows)),
                })),
            }))
            .mockImplementationOnce(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => ({
                        limit: vi.fn().mockResolvedValue([{ userId: "11111111-1111-4111-8111-111111111111" }]),
                    })),
                })),
            }))
            .mockImplementationOnce(() => ({
                from: vi.fn(() => ({
                    where: vi.fn().mockResolvedValue([{ id: "tag-1", userId: "11111111-1111-4111-8111-111111111111" }]),
                })),
            }))
            .mockImplementationOnce(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => makeLimited([])),
                })),
            })),
        insert: vi.fn((table) => {
            if (table === tasksTable) {
                return {
                    values: vi.fn((values) => {
                        capture.taskValues = values;
                        return {
                            returning: vi.fn().mockResolvedValue([{ id: "task-created" }]),
                        };
                    }),
                };
            }

            if (table === taskTagsTable) {
                return {
                    values: vi.fn((values) => {
                        capture.tagValues = values;
                        return {
                            returning: vi.fn().mockResolvedValue(values),
                        };
                    }),
                };
            }

            if (table === taskNlpMetadataTable) {
                return {
                    values: vi.fn((values) => {
                        capture.metadataValues = values;
                        return {
                            returning: vi.fn().mockResolvedValue([{ id: "meta-1", ...values }]),
                        };
                    }),
                };
            }

            return {
                values: vi.fn(() => ({
                    returning: vi.fn().mockResolvedValue([{ id: "unknown" }]),
                })),
            };
        }),
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
                interactionMode: "task",
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
        expect(response.headers.get("x-request-id")).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );

        const body = await response.json() as any;
        expect(body.data[0].tagIds).toEqual(["tag-1"]);
        expect(db.query.tasks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                with: expect.any(Object),
            }),
        );
    });

    it("expands recurring timed tasks into schedule-scoped virtual instances", async () => {
        const db = createFindManyDb([
            {
                id: "series-1",
                userId: "user-1",
                title: "Calculus II lecture",
                state: "ACTIVE",
                orderIndex: 1,
                isAllDay: false,
                dueDate: null,
                scheduledStart: "2026-03-10T09:30:00.000Z",
                scheduledEnd: "2026-03-10T10:45:00.000Z",
                durationEstimate: 75,
                timezoneLocked: true,
                priority: 0,
                isPinned: false,
                reminderAt: null,
                reminderSilenced: false,
                recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502T235959Z",
                interactionMode: "timetable",
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
            "http://localhost/tasks?state=ACTIVE&scheduledRangeStart=2026-03-09&scheduledRangeEnd=2026-03-15",
        );

        expect(response.status).toBe(200);
        const body = await response.json() as any;

        expect(body.data).toHaveLength(2);
        expect(body.data[0]).toMatchObject({
            id: "series-1::2026-03-10T09:30:00.000Z",
            seriesId: "series-1",
            isRecurringInstance: true,
            interactionMode: "timetable",
            occurrenceStart: "2026-03-10T09:30:00.000Z",
            occurrenceEnd: "2026-03-10T10:45:00.000Z",
            tagIds: ["tag-1"],
        });
        expect(body.data[1]).toMatchObject({
            id: "series-1::2026-03-12T09:30:00.000Z",
            occurrenceStart: "2026-03-12T09:30:00.000Z",
        });
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
        expect(body.error.requestId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
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
            dueDate: "2026-03-10T12:00:00.000Z",
            scheduledStart: null,
            scheduledEnd: "2026-03-12T23:59:59.999Z",
            isAllDay: true,
        });
    });

    it("reparses canonical NLP input on task creation and persists resolved project/tag data", async () => {
        const capture: {
            taskValues?: Record<string, unknown>;
            tagValues?: Record<string, unknown>[];
            metadataValues?: Record<string, unknown>;
        } = {};
        const tx = createNlpCreateTx(capture);

        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createTaskApp();
        const response = await app.request("http://localhost/tasks", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                title: "Work on Apollo",
                orderIndex: 1,
                nlp: {
                    rawInput: "Work on Apollo /apollo #planning 2026-03-09",
                    sourceSurface: "quick_add",
                    dateStyle: "mdy",
                    dismissedEntityIds: [],
                    userOverrides: {},
                },
            }),
        });

        expect(response.status).toBe(201);
        expect(capture.taskValues).toMatchObject({
            title: "Work on Apollo",
            projectId: "proj-1",
            dueDate: "2026-03-09T12:00:00.000Z",
            isAllDay: true,
        });
        expect(capture.tagValues).toEqual([{ taskId: "task-created", tagId: "tag-1" }]);
        expect(capture.metadataValues).toMatchObject({
            rawInput: "Work on Apollo /apollo #planning 2026-03-09",
            sourceSurface: "quick_add",
            confidenceTier: "high",
        });
    });

    it("rejects malformed recurrence rules during task creation", async () => {
        const app = createTaskApp();
        const response = await app.request("http://localhost/tasks", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                title: "Broken series",
                orderIndex: 1,
                isAllDay: false,
                scheduledStart: "2026-03-10T09:30:00.000Z",
                scheduledEnd: "2026-03-10T10:45:00.000Z",
                recurrenceRule: "FREQ=WEEKLY;BYDAY=NOPE",
            }),
        });

        expect(response.status).toBe(400);
        const body = await response.json() as any;
        expect(body.error.code).toBe("INVALID_RECURRENCE_RULE");
    });

    it("accepts explicit passive timetable interaction mode during task creation", async () => {
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
                title: "Studio block",
                orderIndex: 1,
                isAllDay: false,
                scheduledStart: "2026-03-10T09:30:00.000Z",
                scheduledEnd: "2026-03-10T10:45:00.000Z",
                recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
                interactionMode: "timetable",
            }),
        });

        expect(response.status).toBe(201);
        expect(capture.values).toMatchObject({
            interactionMode: "timetable",
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
            dueDate: "2026-03-10T12:00:00.000Z",
            scheduledStart: null,
            scheduledEnd: null,
            isAllDay: true,
        });
        expect(trackRescheduleMock).toHaveBeenCalledWith(
            tx,
            "11111111-1111-4111-8111-111111111111",
            "11111111-1111-4111-8111-111111111111",
            "2026-03-10T12:00:00.000Z",
        );
        expect((executionCtx.waitUntil as any)).toHaveBeenCalledTimes(2);
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

    it("reorder endpoint rebalances all tasks when orderedTaskIds is provided", async () => {
        const taskA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        const taskB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
        const taskC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
        const executedSql: string[] = [];
        const tx = {
            execute: vi.fn((query: any) => {
                executedSql.push(String(query));
                return Promise.resolve();
            }),
            select: vi.fn(() => ({
                from: vi.fn(() => ({
                    where: vi.fn().mockResolvedValue([{ id: taskB, orderIndex: 1024, title: "Task B" }]),
                })),
            })),
        };

        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, callback: any) => callback(tx));

        const app = createTaskApp();
        const response = await app.request(`http://localhost/tasks/${taskB}/reorder`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                orderIndex: 1024,
                orderedTaskIds: [taskA, taskB, taskC],
            }),
        });

        expect(response.status).toBe(200);
        // Should have issued a single batch UPDATE via execute()
        expect(tx.execute).toHaveBeenCalledTimes(1);
        // And fetched the moved row back
        expect(tx.select).toHaveBeenCalledTimes(1);
    });
});
