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

import { projectRoutes } from "../../src/domains/projects/projects.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

function createProjectApp() {
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
    app.route("/projects", projectRoutes as any);
    return app;
}

const PROJECT_ROW = {
    id: TEST_PROJECT_ID,
    userId: TEST_USER_ID,
    name: "Sprint Alpha",
    colorAccent: "luminous-amber",
    emoji: null,
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

describe("project route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── POST /projects ──

    it("creates a project with required fields and returns 201", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(PROJECT_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createProjectApp();
        const response = await app.request("http://localhost/projects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Sprint Alpha" }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.name).toBe("Sprint Alpha");
        expect(capture.values).toMatchObject({
            name: "Sprint Alpha",
            colorAccent: "luminous-amber",
            userId: TEST_USER_ID,
        });
    });

    it("creates a project with optional emoji and custom color", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const customRow = { ...PROJECT_ROW, emoji: "🚀", colorAccent: "twilight-blue" };
        const tx = createInsertTx(customRow, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createProjectApp();
        const response = await app.request("http://localhost/projects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "With Emoji", emoji: "🚀", colorAccent: "twilight-blue" }),
        });

        expect(response.status).toBe(201);
        expect(capture.values).toMatchObject({ emoji: "🚀", colorAccent: "twilight-blue" });
    });

    it("rejects project creation with empty name", async () => {
        const app = createProjectApp();
        const response = await app.request("http://localhost/projects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects project creation with name exceeding max length", async () => {
        const app = createProjectApp();
        const response = await app.request("http://localhost/projects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "x".repeat(201) }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── GET /projects ──

    it("lists all projects for the authenticated user", async () => {
        const db = createListDb([PROJECT_ROW, { ...PROJECT_ROW, id: "33333333-3333-4333-8333-333333333333", name: "Sprint Beta" }]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createProjectApp();
        const response = await app.request("http://localhost/projects");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toHaveLength(2);
        expect(body.data[0].name).toBe("Sprint Alpha");
    });

    it("returns empty list when user has no projects", async () => {
        const db = createListDb([]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createProjectApp();
        const response = await app.request("http://localhost/projects");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toEqual([]);
    });

    // ── GET /projects/:id ──

    it("returns a single project by id", async () => {
        const db = createSingleSelectDb([PROJECT_ROW]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createProjectApp();
        const response = await app.request(`http://localhost/projects/${TEST_PROJECT_ID}`);

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.id).toBe(TEST_PROJECT_ID);
    });

    it("returns 404 for a nonexistent project", async () => {
        const db = createSingleSelectDb([]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createProjectApp();
        const response = await app.request(`http://localhost/projects/${TEST_PROJECT_ID}`);

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects a non-uuid project id", async () => {
        const app = createProjectApp();
        const response = await app.request("http://localhost/projects/not-a-uuid");

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── PATCH /projects/:id ──

    it("partially updates a project name", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...PROJECT_ROW, name: "Renamed" };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createProjectApp();
        const response = await app.request(`http://localhost/projects/${TEST_PROJECT_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Renamed" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.name).toBe("Renamed");
        expect(capture.set).toMatchObject({ name: "Renamed" });
    });

    it("returns 404 when patching a nonexistent project", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createProjectApp();
        const response = await app.request(`http://localhost/projects/${TEST_PROJECT_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Renamed" }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    // ── DELETE /projects/:id ──

    it("deletes a project and returns the deleted row", async () => {
        const tx = createDeleteTx([PROJECT_ROW]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createProjectApp();
        const response = await app.request(`http://localhost/projects/${TEST_PROJECT_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.id).toBe(TEST_PROJECT_ID);
    });

    it("returns 404 when deleting a nonexistent project", async () => {
        const tx = createDeleteTx([]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createProjectApp();
        const response = await app.request(`http://localhost/projects/${TEST_PROJECT_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });
});
