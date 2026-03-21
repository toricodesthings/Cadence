import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/platform/request-log";
import type { AuthVariables } from "../../src/platform/auth";
import { formatErrorResponse } from "../../src/platform/errors";

const { getDbClientMock, withRlsMock } = vi.hoisted(() => ({
    getDbClientMock: vi.fn(),
    withRlsMock: vi.fn(),
}));

vi.mock("../../src/platform/db", () => ({
    getDbClient: getDbClientMock,
}));

vi.mock("../../src/platform/rls", () => ({
    withRls: withRlsMock,
}));

import { tagRoutes } from "../../src/domains/tags/tags.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_TAG_ID = "22222222-2222-4222-8222-222222222222";

function createTagApp() {
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
    app.route("/tags", tagRoutes as any);
    return app;
}

const TAG_ROW = {
    id: TEST_TAG_ID,
    userId: TEST_USER_ID,
    name: "urgent",
    color: "default",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
};

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

function createSingleSelectDb(rows: unknown[]) {
    return {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(rows),
            })),
        })),
    };
}

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

describe("tag route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── POST /tags ──

    it("creates a tag with required name and default color", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(TAG_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createTagApp();
        const response = await app.request("http://localhost/tags", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "urgent" }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.name).toBe("urgent");
        expect(capture.values).toMatchObject({
            name: "urgent",
            color: "default",
            userId: TEST_USER_ID,
        });
    });

    it("creates a tag with custom color", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const customRow = { ...TAG_ROW, color: "red" };
        const tx = createInsertTx(customRow, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createTagApp();
        const response = await app.request("http://localhost/tags", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "high-priority", color: "red" }),
        });

        expect(response.status).toBe(201);
        expect(capture.values).toMatchObject({ name: "high-priority", color: "red" });
    });

    it("rejects tag creation with empty name", async () => {
        const app = createTagApp();
        const response = await app.request("http://localhost/tags", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects tag creation with name exceeding max length", async () => {
        const app = createTagApp();
        const response = await app.request("http://localhost/tags", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "x".repeat(101) }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── GET /tags ──

    it("lists all tags for the authenticated user ordered by name", async () => {
        const db = createListDb([TAG_ROW, { ...TAG_ROW, id: "33333333-3333-4333-8333-333333333333", name: "work" }]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createTagApp();
        const response = await app.request("http://localhost/tags");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toHaveLength(2);
    });

    it("returns empty list when user has no tags", async () => {
        const db = createListDb([]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createTagApp();
        const response = await app.request("http://localhost/tags");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toEqual([]);
    });

    // ── GET /tags/:id ──

    it("returns a single tag by id", async () => {
        const db = createSingleSelectDb([TAG_ROW]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createTagApp();
        const response = await app.request(`http://localhost/tags/${TEST_TAG_ID}`);

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.id).toBe(TEST_TAG_ID);
    });

    it("returns 404 for a nonexistent tag", async () => {
        const db = createSingleSelectDb([]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createTagApp();
        const response = await app.request(`http://localhost/tags/${TEST_TAG_ID}`);

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects a non-uuid tag id", async () => {
        const app = createTagApp();
        const response = await app.request("http://localhost/tags/not-a-uuid");

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── PATCH /tags/:id ──

    it("partially updates a tag name", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...TAG_ROW, name: "renamed" };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createTagApp();
        const response = await app.request(`http://localhost/tags/${TEST_TAG_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "renamed" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.name).toBe("renamed");
        expect(capture.set).toMatchObject({ name: "renamed" });
    });

    it("returns 404 when patching a nonexistent tag", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createTagApp();
        const response = await app.request(`http://localhost/tags/${TEST_TAG_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "renamed" }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    // ── DELETE /tags/:id ──

    it("deletes a tag and returns the deleted row", async () => {
        const tx = createDeleteTx([TAG_ROW]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createTagApp();
        const response = await app.request(`http://localhost/tags/${TEST_TAG_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.id).toBe(TEST_TAG_ID);
    });

    it("returns 404 when deleting a nonexistent tag", async () => {
        const tx = createDeleteTx([]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createTagApp();
        const response = await app.request(`http://localhost/tags/${TEST_TAG_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });
});
