import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/lib/request-log";
import type { AuthVariables } from "../../src/lib/auth";
import { formatErrorResponse } from "../../src/lib/errors";

const { getDbClientMock, withRlsMock } = vi.hoisted(() => ({
    getDbClientMock: vi.fn(),
    withRlsMock: vi.fn(),
}));

vi.mock("../../src/lib/db", () => ({
    getDbClient: getDbClientMock,
}));

vi.mock("../../src/lib/rls", () => ({
    withRls: withRlsMock,
}));

import { subtaskRoutes } from "../../src/routes/subtasks";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_TASK_ID = "22222222-2222-4222-8222-222222222222";
const TEST_SUBTASK_ID = "33333333-3333-4333-8333-333333333333";

function createSubtaskApp() {
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
    app.route("/", subtaskRoutes as any);
    return app;
}

const SUBTASK_ROW = {
    id: TEST_SUBTASK_ID,
    taskId: TEST_TASK_ID,
    userId: TEST_USER_ID,
    title: "Research paper",
    isComplete: false,
    orderIndex: 0,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
};

function createListTx(parentExists: boolean, subtaskRows: unknown[]) {
    const parentResult = parentExists ? [{ id: TEST_TASK_ID }] : [];
    // First select() call: parent check → select().from().where() → resolves to parentResult
    // Second select() call: subtask list → select().from().where().orderBy() → resolves to subtaskRows
    // Both calls share the same `select` mock, so we use mockReturnValueOnce to differentiate
    const selectMock = vi.fn()
        .mockReturnValueOnce({
            from: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(parentResult),
            })),
        })
        .mockReturnValueOnce({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn().mockResolvedValue(subtaskRows),
                })),
            })),
        });
    return { select: selectMock };
}

function createInsertTx(
    parentExists: boolean,
    insertedRow: Record<string, unknown>,
    capture: { values?: Record<string, unknown> },
) {
    return {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(parentExists ? [{ id: TEST_TASK_ID }] : []),
            })),
        })),
        insert: vi.fn(() => ({
            values: vi.fn((values: Record<string, unknown>) => {
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

describe("subtask route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── GET /tasks/:taskId/subtasks ──

    it("lists subtasks for a valid parent task", async () => {
        const tx = createListTx(true, [SUBTASK_ROW]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/tasks/${TEST_TASK_ID}/subtasks`);

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toHaveLength(1);
        expect(body.data[0].title).toBe("Research paper");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    it("returns 404 when parent task does not exist", async () => {
        const tx = createListTx(false, []);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/tasks/${TEST_TASK_ID}/subtasks`);

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects list with invalid taskId param", async () => {
        const app = createSubtaskApp();
        const response = await app.request("http://localhost/tasks/not-a-uuid/subtasks");

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── POST /tasks/:taskId/subtasks ──

    it("creates a subtask under a valid parent task", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(true, SUBTASK_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/tasks/${TEST_TASK_ID}/subtasks`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "Research paper", orderIndex: 0 }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.title).toBe("Research paper");
        expect(capture.values).toMatchObject({
            taskId: TEST_TASK_ID,
            userId: TEST_USER_ID,
            title: "Research paper",
            orderIndex: 0,
        });
    });

    it("returns 404 when creating subtask for nonexistent parent", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(false, SUBTASK_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/tasks/${TEST_TASK_ID}/subtasks`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "Research paper", orderIndex: 0 }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects subtask creation with empty title", async () => {
        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/tasks/${TEST_TASK_ID}/subtasks`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "", orderIndex: 0 }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects subtask creation with title exceeding max length", async () => {
        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/tasks/${TEST_TASK_ID}/subtasks`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "x".repeat(501), orderIndex: 0 }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects subtask creation without orderIndex", async () => {
        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/tasks/${TEST_TASK_ID}/subtasks`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "No order" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── PATCH /subtasks/:id ──

    it("partially updates a subtask title", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...SUBTASK_ROW, title: "Updated title" };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/subtasks/${TEST_SUBTASK_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "Updated title" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.title).toBe("Updated title");
        expect(capture.set).toMatchObject({ title: "Updated title" });
    });

    it("toggles subtask completion status", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...SUBTASK_ROW, isComplete: true };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/subtasks/${TEST_SUBTASK_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isComplete: true }),
        });

        expect(response.status).toBe(200);
        expect(capture.set).toMatchObject({ isComplete: true });
    });

    it("returns 404 when patching a nonexistent subtask", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/subtasks/${TEST_SUBTASK_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "Updated" }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    // ── PATCH /subtasks/:id/reorder ──

    it("reorders a subtask by updating orderIndex", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...SUBTASK_ROW, orderIndex: 3 };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/subtasks/${TEST_SUBTASK_ID}/reorder`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderIndex: 3 }),
        });

        expect(response.status).toBe(200);
        expect(capture.set).toMatchObject({ orderIndex: 3 });
    });

    it("rejects reorder without orderIndex", async () => {
        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/subtasks/${TEST_SUBTASK_ID}/reorder`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 404 when reordering a nonexistent subtask", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/subtasks/${TEST_SUBTASK_ID}/reorder`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderIndex: 3 }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    // ── DELETE /subtasks/:id ──

    it("deletes a subtask and returns the deleted row", async () => {
        const tx = createDeleteTx([SUBTASK_ROW]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/subtasks/${TEST_SUBTASK_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.id).toBe(TEST_SUBTASK_ID);
    });

    it("returns 404 when deleting a nonexistent subtask", async () => {
        const tx = createDeleteTx([]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSubtaskApp();
        const response = await app.request(`http://localhost/subtasks/${TEST_SUBTASK_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects delete with invalid uuid param", async () => {
        const app = createSubtaskApp();
        const response = await app.request("http://localhost/subtasks/not-valid", {
            method: "DELETE",
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });
});
