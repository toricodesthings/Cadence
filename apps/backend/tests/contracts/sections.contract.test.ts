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

import { sectionRoutes } from "../../src/domains/sections/sections.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_SECTION_ID = "22222222-2222-4222-8222-222222222222";
const TEST_PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function createSectionApp() {
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
    app.route("/sections", sectionRoutes as any);
    return app;
}

const SECTION_ROW = {
    id: TEST_SECTION_ID,
    userId: TEST_USER_ID,
    name: "To Do",
    orderIndex: 0,
    projectId: null,
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

describe("section route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── GET /sections ──

    it("lists unscoped sections when no projectId is provided", async () => {
        const db = createListDb([SECTION_ROW]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createSectionApp();
        const response = await app.request("http://localhost/sections");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toHaveLength(1);
        expect(body.data[0].name).toBe("To Do");
    });

    it("lists sections scoped to a specific project", async () => {
        const projectSection = { ...SECTION_ROW, projectId: TEST_PROJECT_ID };
        const db = createListDb([projectSection]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createSectionApp();
        const response = await app.request(`http://localhost/sections?projectId=${TEST_PROJECT_ID}`);

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toHaveLength(1);
    });

    it("returns empty list when no sections exist", async () => {
        const db = createListDb([]);
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(db));

        const app = createSectionApp();
        const response = await app.request("http://localhost/sections");

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data).toEqual([]);
    });

    // ── POST /sections ──

    it("creates a section with name and orderIndex", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const tx = createInsertTx(SECTION_ROW, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSectionApp();
        const response = await app.request("http://localhost/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "To Do", orderIndex: 0 }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.name).toBe("To Do");
        expect(capture.values).toMatchObject({
            name: "To Do",
            orderIndex: 0,
            userId: TEST_USER_ID,
        });
    });

    it("creates a section scoped to a project", async () => {
        const capture: { values?: Record<string, unknown> } = {};
        const projectSection = { ...SECTION_ROW, projectId: TEST_PROJECT_ID };
        const tx = {
            ...createInsertTx(projectSection, capture),
            select: vi.fn(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => ({
                        limit: vi.fn().mockResolvedValue([{ userId: TEST_USER_ID }]),
                    })),
                })),
            })),
        };
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSectionApp();
        const response = await app.request("http://localhost/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "In Progress", orderIndex: 1, projectId: TEST_PROJECT_ID }),
        });

        expect(response.status).toBe(201);
        expect(capture.values).toMatchObject({ projectId: TEST_PROJECT_ID });
    });

    it("rejects section creation without orderIndex", async () => {
        const app = createSectionApp();
        const response = await app.request("http://localhost/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Missing orderIndex" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects section creation with empty name", async () => {
        const app = createSectionApp();
        const response = await app.request("http://localhost/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "", orderIndex: 0 }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects section creation with name exceeding max length", async () => {
        const app = createSectionApp();
        const response = await app.request("http://localhost/sections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "x".repeat(201), orderIndex: 0 }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── PATCH /sections/:id ──

    it("partially updates a section name", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...SECTION_ROW, name: "Done" };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSectionApp();
        const response = await app.request(`http://localhost/sections/${TEST_SECTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Done" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.name).toBe("Done");
        expect(capture.set).toMatchObject({ name: "Done" });
    });

    it("partially updates a section orderIndex", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const updatedRow = { ...SECTION_ROW, orderIndex: 5 };
        const tx = createUpdateTx([updatedRow], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSectionApp();
        const response = await app.request(`http://localhost/sections/${TEST_SECTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderIndex: 5 }),
        });

        expect(response.status).toBe(200);
        expect(capture.set).toMatchObject({ orderIndex: 5 });
    });

    it("returns 404 when patching a nonexistent section", async () => {
        const capture: { set?: Record<string, unknown> } = {};
        const tx = createUpdateTx([], capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSectionApp();
        const response = await app.request(`http://localhost/sections/${TEST_SECTION_ID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Done" }),
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects patch with invalid uuid param", async () => {
        const app = createSectionApp();
        const response = await app.request("http://localhost/sections/not-valid", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Done" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    // ── DELETE /sections/:id ──

    it("deletes a section and returns the deleted id", async () => {
        const tx = createDeleteTx([SECTION_ROW]);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

        const app = createSectionApp();
        const response = await app.request(`http://localhost/sections/${TEST_SECTION_ID}`, {
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

        const app = createSectionApp();
        const response = await app.request(`http://localhost/sections/${TEST_SECTION_ID}`, {
            method: "DELETE",
        });

        expect(response.status).toBe(404);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("NOT_FOUND");
    });

    it("rejects delete with invalid uuid param", async () => {
        const app = createSectionApp();
        const response = await app.request("http://localhost/sections/invalid-id", {
            method: "DELETE",
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });
});
