import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, TEST_USER_ID } from "../helpers/app";

const { getDbClientMock, withRlsMock } = vi.hoisted(() => ({
    getDbClientMock: vi.fn(),
    withRlsMock: vi.fn(),
}));

vi.mock("../../src/platform/db", () => ({ getDbClient: getDbClientMock }));
vi.mock("../../src/platform/rls", () => ({ withRls: withRlsMock }));

import { eventRoutes } from "../../src/domains/events/events.route";

/** One tx serving both the opt-in lookup (select) and the event write (insert). */
function mockDb(usageDiagnostics: boolean) {
    const inserted: unknown[] = [];
    const tx = {
        select: () => ({
            from: () => ({
                where: () => ({ limit: async () => [{ settings: { privacy: { usageDiagnostics } } }] }),
            }),
        }),
        insert: vi.fn(() => ({
            values: async (values: unknown) => {
                inserted.push(values);
            },
        })),
    };
    getDbClientMock.mockReturnValue({});
    withRlsMock.mockImplementation(async (_db: unknown, _userId: unknown, cb: (t: typeof tx) => unknown) => cb(tx));
    return { tx, inserted };
}

/** The write runs in `waitUntil`; collect it so the test can await it. */
async function post(path: string, body: unknown) {
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} };
    const response = await createTestApp("/events", eventRoutes).request(
        `http://localhost${path}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        {},
        ctx as any,
    );
    await Promise.all(pending);
    return response;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("POST /events and /events/batch", () => {
    it.each([
        {
            path: "/events",
            body: { event: "task.reschedule", metadata: { from: "2026-03-10", to: "2026-03-12" } },
            rows: { userId: TEST_USER_ID, event: "task.reschedule", metadata: { from: "2026-03-10", to: "2026-03-12" } },
        },
        {
            path: "/events/batch",
            body: { events: [{ event: "task.complete" }, { event: "schedule.open", metadata: { view: "week" } }] },
            rows: [
                { userId: TEST_USER_ID, event: "task.complete", metadata: null },
                { userId: TEST_USER_ID, event: "schedule.open", metadata: { view: "week" } },
            ],
        },
    ])("$path records events for the caller when diagnostics are on", async ({ path, body, rows }) => {
        const { inserted } = mockDb(true);

        const response = await post(path, body);

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ data: { tracked: true } });
        expect(inserted).toEqual([rows]);
    });

    it.each([
        ["/events", { event: "task.complete" }],
        ["/events/batch", { events: [{ event: "task.complete" }] }],
    ])("%s writes nothing when the user opted out of diagnostics", async (path, body) => {
        const { tx } = mockDb(false);

        const response = await post(path, body);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ data: { tracked: false } });
        expect(tx.insert).not.toHaveBeenCalled();
    });

    it.each([
        ["/events", { event: "not.a.real.event" }, "unknown event name"],
        ["/events", {}, "missing event"],
        ["/events/batch", { events: [] }, "empty batch"],
        ["/events/batch", { events: [{ event: "task.complete" }, { event: "bad.event.name" }] }, "one bad name in a batch"],
    ])("%s rejects %j (%s) with 400 before touching the DB", async (path, body, _reason) => {
        const response = await post(path, body);

        expect(response.status).toBe(400);
        expect((await response.json() as any).error.code).toBe("INVALID_REQUEST");
        expect(getDbClientMock).not.toHaveBeenCalled();
    });
});
