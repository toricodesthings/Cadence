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

import { eventRoutes } from "../../src/routes/events";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

const mockExecutionCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
};

function createEventApp() {
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
    app.route("/events", eventRoutes as any);
    return app;
}

function eventRequest(app: Hono<any>, url: string, init?: RequestInit) {
    return app.request(url, init, {}, mockExecutionCtx as any);
}

function createTrackingAllowedDb(allowed: boolean) {
    return {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue(
                        allowed
                            ? [{ settings: { privacy: { usageDiagnostics: true } } }]
                            : [{ settings: { privacy: { usageDiagnostics: false } } }],
                    ),
                })),
            })),
        })),
    };
}

function createInsertTx() {
    return {
        insert: vi.fn(() => ({
            values: vi.fn().mockResolvedValue(undefined),
        })),
    };
}

describe("events route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── POST /events ──

    it("accepts a valid single event when tracking is allowed", async () => {
        const db = createTrackingAllowedDb(true);
        const tx = createInsertTx();
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, callback: any) => callback(tx));

        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ event: "task.complete" }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.tracked).toBe(true);
    });

    it("returns tracked:false when user has opted out of diagnostics", async () => {
        const db = createTrackingAllowedDb(false);
        getDbClientMock.mockReturnValue(db);

        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ event: "task.complete" }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.tracked).toBe(false);
    });

    it("accepts optional metadata on a single event", async () => {
        const db = createTrackingAllowedDb(true);
        const tx = createInsertTx();
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, callback: any) => callback(tx));

        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                event: "task.reschedule",
                metadata: { from: "2026-03-10", to: "2026-03-12" },
            }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.tracked).toBe(true);
    });

    it("rejects an event with an invalid event name", async () => {
        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ event: "not.a.real.event" }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects a request with no event field", async () => {
        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
        });

        expect(response.status).toBe(400);
    });

    // ── POST /events/batch ──

    it("accepts a valid batch of events", async () => {
        const db = createTrackingAllowedDb(true);
        const tx = createInsertTx();
        getDbClientMock.mockReturnValue(db);
        withRlsMock.mockImplementation(async (_db: any, _userId: any, callback: any) => callback(tx));

        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events/batch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                events: [
                    { event: "task.complete" },
                    { event: "schedule.open", metadata: { view: "week" } },
                ],
            }),
        });

        expect(response.status).toBe(201);
        const body = (await response.json()) as any;
        expect(body.data.tracked).toBe(true);
    });

    it("rejects an empty batch", async () => {
        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events/batch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ events: [] }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects a batch containing an invalid event name", async () => {
        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events/batch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                events: [{ event: "task.complete" }, { event: "bad.event.name" }],
            }),
        });

        expect(response.status).toBe(400);
        const body = (await response.json()) as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns tracked:false for batch when user opted out", async () => {
        const db = createTrackingAllowedDb(false);
        getDbClientMock.mockReturnValue(db);

        const app = createEventApp();
        const response = await eventRequest(app, "http://localhost/events/batch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                events: [{ event: "task.complete" }],
            }),
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as any;
        expect(body.data.tracked).toBe(false);
    });
});
