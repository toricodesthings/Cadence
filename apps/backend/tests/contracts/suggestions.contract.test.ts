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

import { suggestionRoutes } from "../../src/domains/suggestions/suggestions.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_SUGGESTION_ID = "22222222-2222-4222-8222-222222222222";

function createSuggestionApp() {
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
    app.route("/suggestions", suggestionRoutes as any);
    return app;
}

const SUGGESTION_ROW = {
    id: TEST_SUGGESTION_ID,
    userId: TEST_USER_ID,
    type: "RESCHEDULE",
    payload: { taskId: "task-1", suggestedDate: "2026-03-15" },
    status: "PENDING",
    resolvedAt: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
};

function createListDb(rows: unknown[]) {
    return {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn().mockResolvedValue(rows),
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

describe("suggestion route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── GET /suggestions ──

    it("lists pending suggestions for the authenticated user", async () => {
        const db = createListDb([SUGGESTION_ROW]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createSuggestionApp();
        const response = await app.request("http://localhost/suggestions");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toHaveLength(1);
        expect(body.data[0].status).toBe("PENDING");
    });

    it("returns empty list when no pending suggestions exist", async () => {
        const db = createListDb([]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createSuggestionApp();
        const response = await app.request("http://localhost/suggestions");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toEqual([]);
    });

    // ── PATCH /suggestions/:id ──

    it("accepts a suggestion by setting status to ACCEPTED", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...SUGGESTION_ROW, status: "ACCEPTED", resolvedAt: "2026-03-16T12:00:00.000Z" };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSuggestionApp();
        const response = await app.request(`http://localhost/suggestions/${TEST_SUGGESTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "ACCEPTED" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.status).toBe("ACCEPTED");
        expect(capture.set?.status).toBe("ACCEPTED");
        expect(capture.set?.resolvedAt).toBeDefined();
    });

    it("dismisses a suggestion by setting status to DISMISSED", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...SUGGESTION_ROW, status: "DISMISSED", resolvedAt: "2026-03-16T12:00:00.000Z" };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSuggestionApp();
        const response = await app.request(`http://localhost/suggestions/${TEST_SUGGESTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "DISMISSED" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.status).toBe("DISMISSED");
        expect(capture.set?.status).toBe("DISMISSED");
    });

    it("rejects an invalid status value", async () => {
        const app = createSuggestionApp();
        const response = await app.request(`http://localhost/suggestions/${TEST_SUGGESTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "INVALID_STATUS" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects patch without status field", async () => {
        const app = createSuggestionApp();
        const response = await app.request(`http://localhost/suggestions/${TEST_SUGGESTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 404 when resolving a nonexistent suggestion", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSuggestionApp();
        const response = await app.request(`http://localhost/suggestions/${TEST_SUGGESTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "ACCEPTED" }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects patch with invalid uuid param", async () => {
        const app = createSuggestionApp();
        const response = await app.request("http://localhost/suggestions/not-a-uuid", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "ACCEPTED" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });
});
