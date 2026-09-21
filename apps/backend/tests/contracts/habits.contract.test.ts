import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { SQL } from "drizzle-orm";
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

import { habitRoutes } from "../../src/domains/habits/habits.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_HABIT_ID = "33333333-3333-4333-8333-333333333333";

const HABIT_ROW = {
    id: TEST_HABIT_ID,
    userId: TEST_USER_ID,
    title: "Stretch",
    reminderEnabled: true,
    colorAccent: "emerald",
    archived: false,
};

function createHabitApp() {
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
    app.route("/habits", habitRoutes as any);
    return app;
}

/** A tx whose update records the `.set()` payload; the follow-up tag read returns none. */
function createPatchTx(capture: { set?: Record<string, unknown> }) {
    return {
        update: vi.fn(() => ({
            set: vi.fn((values: Record<string, unknown>) => {
                capture.set = values;
                return {
                    where: vi.fn(() => ({
                        returning: vi.fn().mockResolvedValue([HABIT_ROW]),
                    })),
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

async function patchHabit(body: Record<string, unknown>) {
    const capture: { set?: Record<string, unknown> } = {};
    const tx = createPatchTx(capture);
    getDbClientMock.mockReturnValue(tx);
    withRlsMock.mockImplementation(async (_db: any, _userId: any, cb: any) => cb(tx));

    const response = await createHabitApp().request(`http://localhost/habits/${TEST_HABIT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    return { response, set: capture.set };
}

describe("PATCH /habits/:id", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("writes only the fields that were sent", async () => {
        // Regression: archiving used to also reset colour, reminder, and mode to their defaults.
        const { response, set } = await patchHabit({ archived: true });

        expect(response.status).toBe(200);
        expect(set).toEqual({ archived: true, updatedAt: expect.any(SQL) });
    });
});
