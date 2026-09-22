import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, TEST_USER_ID } from "../helpers/app";

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

const TEST_SUGGESTION_ID = "22222222-2222-4222-8222-222222222222";

function createSuggestionApp() {
    return createTestApp("/suggestions", suggestionRoutes);
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

    function patch(id: string, body: unknown) {
        return createSuggestionApp().request(`http://localhost/suggestions/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    it.each(["ACCEPTED", "DISMISSED"])("resolves a suggestion as %s and stamps resolvedAt", async (status) => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([{ ...SUGGESTION_ROW, status, resolvedAt: "2026-03-16T12:00:00.000Z" }], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const response = await patch(TEST_SUGGESTION_ID, { status });

        expect(response.status).toBe(200);
        expect(((await response.json()) as any).data.status).toBe(status);
        expect(capture.set?.status).toBe(status);
        expect(capture.set?.resolvedAt).toBeDefined();
    });

    it.each([
        ["an unknown status", TEST_SUGGESTION_ID, { status: "INVALID_STATUS" }],
        ["a missing status", TEST_SUGGESTION_ID, {}],
        ["a non-uuid id", "not-a-uuid", { status: "ACCEPTED" }],
    ])("rejects %s with 400 before touching the DB", async (_label, id, body) => {
        const response = await patch(id, body);

        expect(response.status).toBe(400);
        expect(((await response.json()) as any).error.code).toBe("INVALID_REQUEST");
        expect(getDbClientMock).not.toHaveBeenCalled();
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

});
