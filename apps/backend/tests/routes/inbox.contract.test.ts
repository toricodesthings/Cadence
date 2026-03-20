import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/lib/request-log";
import type { AuthVariables } from "../../src/lib/auth";
import { formatErrorResponse } from "../../src/lib/errors";
import { inboxItems as inboxItemsTable, tasks as tasksTable, taskTags as taskTagsTable, taskNlpMetadata as taskNlpMetadataTable } from "../../src/db/schema";

const { getDbClientMock, withRlsMock, checkIdempotencyMock, recordMutationMock } = vi.hoisted(() => ({
    getDbClientMock: vi.fn(),
    withRlsMock: vi.fn(),
    checkIdempotencyMock: vi.fn().mockResolvedValue(null),
    recordMutationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/lib/db", () => ({
    getDbClient: getDbClientMock,
}));

vi.mock("../../src/lib/rls", () => ({
    withRls: withRlsMock,
}));

vi.mock("../../src/lib/idempotency", () => ({
    checkIdempotency: checkIdempotencyMock,
    recordMutation: recordMutationMock,
}));

import { inboxRoutes } from "../../src/routes/inbox";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const TEST_SECTION_ID = "33333333-3333-4333-8333-333333333333";

function createInboxApp() {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.onError((err, c) => {
        const res = formatErrorResponse(err);
        return c.json(res.body, res.status as 500);
    });
    app.use("*", createRequestContext());
    app.use("*", async (c, next) => {
        c.set("userId", TEST_USER_ID);
        await next();
    });
    app.route("/inbox", inboxRoutes as any);
    return app;
}

const ITEM_ROW = {
    id: TEST_ITEM_ID,
    userId: TEST_USER_ID,
    rawText: "Buy groceries",
    sectionId: null,
    orderIndex: 0,
    processed: false,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
};

const SECTION_ROW = {
    id: TEST_SECTION_ID,
    userId: TEST_USER_ID,
    name: "Later",
    orderIndex: 0,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
};

function createInsertTx(insertedRow: Record<string, unknown>, capture: { values?: Record<string, unknown> }) {
    return {
        insert: vi.fn(() => ({
            values: vi.fn((values: Record<string, unknown>) => {
                capture.values = values;
                return {
                    returning: vi.fn().mockResolvedValue([insertedRow]),
                };
            }),
        })),
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn().mockResolvedValue([]),
            })),
        })),
    };
}

function createListDb(rows: unknown[]) {
    return {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn().mockResolvedValue(rows),
                })),
            })),
        })),
    };
}

function createUpdateTx(updatedRows: unknown[], capture: { set?: Record<string, unknown> }) {
    return {
        update: vi.fn(() => ({
            set: vi.fn((values: Record<string, unknown>) => {
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

function createDeleteTx(deletedRows: unknown[]) {
    return {
        delete: vi.fn(() => ({
            where: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue(deletedRows),
            })),
        })),
    };
}

function createInboxProcessTx(capture: {
    taskValues?: Record<string, unknown>;
    tagValues?: Record<string, unknown>[];
    metadataValues?: Record<string, unknown>;
    inboxUpdate?: Record<string, unknown>;
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
                    where: vi.fn(() => makeWherePromise([ITEM_ROW])),
                })),
            }))
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
        update: vi.fn((table) => {
            if (table === inboxItemsTable) {
                return {
                    set: vi.fn((values) => {
                        capture.inboxUpdate = values;
                        return {
                            where: vi.fn(() => ({
                                returning: vi.fn().mockResolvedValue([{
                                    ...ITEM_ROW,
                                    ...values,
                                }]),
                            })),
                        };
                    }),
                };
            }

            return {
                set: vi.fn(() => ({
                    where: vi.fn(() => ({
                        returning: vi.fn().mockResolvedValue([]),
                    })),
                })),
            };
        }),
    };
}

describe("inbox route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        checkIdempotencyMock.mockResolvedValue(null);
    });

    // ── POST /inbox (items) ──

    it("creates an inbox item with required rawText", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(ITEM_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rawText: "Buy groceries" }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.rawText).toBe("Buy groceries");
        expect(capture.values).toMatchObject({ rawText: "Buy groceries", userId: TEST_USER_ID });
    });

    it("supports idempotent inbox item creation via clientMutationId", async () => {
        // First call: no existing mutation
        checkIdempotencyMock.mockResolvedValue(null);
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(ITEM_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rawText: "Buy groceries", clientMutationId: "mut-1" }),
        });

        expect(response.status).toBe(201);
        expect(recordMutationMock).toHaveBeenCalled();
    });

    it("returns existing item when clientMutationId already processed", async () => {
        checkIdempotencyMock.mockResolvedValue(TEST_ITEM_ID);
        const tx = {
            ...createInsertTx(ITEM_ROW, {}),
            select: vi.fn(() => ({
                from: vi.fn(() => ({
                    where: vi.fn().mockResolvedValue([ITEM_ROW]),
                })),
            })),
        };
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rawText: "Buy groceries", clientMutationId: "mut-1" }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.id).toBe(TEST_ITEM_ID);
    });

    it("rejects inbox item with empty rawText", async () => {
        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rawText: "" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects inbox item with rawText exceeding 5000 chars", async () => {
        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rawText: "x".repeat(5001) }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── GET /inbox ──

    it("lists unprocessed inbox items", async () => {
        const db = createListDb([ITEM_ROW]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toHaveLength(1);
        expect(body.data[0].rawText).toBe("Buy groceries");
    });

    it("returns empty list when no unprocessed items", async () => {
        const db = createListDb([]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toEqual([]);
    });

    // ── PATCH /inbox/:id ──

    it("updates an inbox item rawText", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...ITEM_ROW, rawText: "Updated text" };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/${TEST_ITEM_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rawText: "Updated text" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.rawText).toBe("Updated text");
    });

    it("returns 404 when patching a nonexistent inbox item", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/${TEST_ITEM_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rawText: "Updated" }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects patch with invalid uuid param", async () => {
        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox/not-a-uuid", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rawText: "test" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── DELETE /inbox/:id ──

    it("deletes an inbox item and returns the deleted row", async () => {
        const tx = createDeleteTx([ITEM_ROW]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/${TEST_ITEM_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.id).toBe(TEST_ITEM_ID);
    });

    it("returns 404 when deleting a nonexistent inbox item", async () => {
        const tx = createDeleteTx([]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/${TEST_ITEM_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    // ── POST /inbox/sections ──

    it("creates an inbox section with required name", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(SECTION_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Later" }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.name).toBe("Later");
    });

    it("supports idempotent section creation via clientMutationId", async () => {
        checkIdempotencyMock.mockResolvedValue(null);
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(SECTION_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Later", clientMutationId: "mut-s1" }),
        });

        expect(response.status).toBe(201);
        expect(recordMutationMock).toHaveBeenCalled();
    });

    it("atomically processes an inbox item into a task with canonical NLP parsing", async () => {
        const capture: {
            taskValues?: Record<string, unknown>;
            tagValues?: Record<string, unknown>[];
            metadataValues?: Record<string, unknown>;
            inboxUpdate?: Record<string, unknown>;
        } = {};
        const tx = createInboxProcessTx(capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/${TEST_ITEM_ID}/process`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                title: "Work on Apollo",
                keepNote: false,
                nlp: {
                    rawInput: "Work on Apollo /apollo #planning 2026-03-09",
                    sourceSurface: "inbox",
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
            sourceSurface: "inbox",
            confidenceTier: "high",
        });
        expect(capture.inboxUpdate).toMatchObject({
            captureStatus: "placed",
            placedTaskId: "task-created",
            processed: true,
            analysisStatus: "applied",
            sourceSurface: "inbox",
        });
    });

    it("rejects section creation with empty name", async () => {
        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects section creation with name exceeding max length", async () => {
        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "x".repeat(201) }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── GET /inbox/sections ──

    it("lists all inbox sections", async () => {
        const db = createListDb([SECTION_ROW]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createInboxApp();
        const response = await app.request("http://localhost/inbox/sections");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toHaveLength(1);
        expect(body.data[0].name).toBe("Later");
    });

    // ── PATCH /inbox/sections/:id ──

    it("partially updates a section name", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...SECTION_ROW, name: "Someday" };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/sections/${TEST_SECTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Someday" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.name).toBe("Someday");
    });

    it("returns 404 when patching a nonexistent section", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/sections/${TEST_SECTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Someday" }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    // ── DELETE /inbox/sections/:id ──

    it("deletes a section and returns the deleted row", async () => {
        const tx = createDeleteTx([SECTION_ROW]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/sections/${TEST_SECTION_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.id).toBe(TEST_SECTION_ID);
    });

    it("returns 404 when deleting a nonexistent section", async () => {
        const tx = createDeleteTx([]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createInboxApp();
        const response = await app.request(`http://localhost/inbox/sections/${TEST_SECTION_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });
});
