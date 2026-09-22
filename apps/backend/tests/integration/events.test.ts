import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { eventRoutes } from "../../src/domains/events/events.route";

beforeAll(startTestDb);

async function storedEvents(userId: string) {
    return asOwner(async (pg) => (await pg.query("SELECT event, metadata FROM usage_events WHERE user_id = $1 ORDER BY created_at, event", [userId])).rows);
}

describe("usage events", () => {
    it.each([
        ["/events", { event: "task.reschedule", metadata: { from: "2026-03-10" } }, [{ event: "task.reschedule", metadata: { from: "2026-03-10" } }]],
        [
            "/events/batch",
            { events: [{ event: "task.complete" }, { event: "schedule.open", metadata: { view: "week" } }] },
            [{ event: "schedule.open", metadata: { view: "week" } }, { event: "task.complete", metadata: null }],
        ],
    ])("%s records events for a user with the default diagnostics setting", async (path, body, expected) => {
        const userId = await createUser();

        const { status, body: res } = await apiAs(userId, "/events", eventRoutes)("POST", path.replace("/events", ""), body);

        expect(status).toBe(201);
        expect(res.data).toEqual({ tracked: true });
        expect(await storedEvents(userId)).toEqual(expected);
    });

    it.each([["/events", { event: "task.complete" }], ["/events/batch", { events: [{ event: "task.complete" }] }]])(
        "%s stores nothing once the user opts out",
        async (path, body) => {
            const userId = await createUser({ privacy: { usageDiagnostics: false } });

            const { status, body: res } = await apiAs(userId, "/events", eventRoutes)("POST", path.replace("/events", ""), body);

            expect(status).toBe(200);
            expect(res.data).toEqual({ tracked: false });
            expect(await storedEvents(userId)).toEqual([]);
        },
    );

    it.each([
        ["", { event: "not.a.real.event" }],
        ["", {}],
        ["/batch", { events: [] }],
        ["/batch", { events: [{ event: "task.complete" }, { event: "bad.event.name" }] }],
    ])("POST /events%s rejects %j with 400 and stores nothing", async (path, body) => {
        const userId = await createUser();

        expect((await apiAs(userId, "/events", eventRoutes)("POST", path, body)).status).toBe(400);
        expect(await storedEvents(userId)).toEqual([]);
    });
});
