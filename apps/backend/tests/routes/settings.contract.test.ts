import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/lib/request-log";
import type { AuthVariables } from "../../src/lib/auth";

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

import { settingsRoutes } from "../../src/routes/settings";

function createSettingsApp() {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use("*", createRequestContext());
    app.use("*", async (c, next) => {
        c.set("userId", "11111111-1111-4111-8111-111111111111");
        await next();
    });
    app.route("/settings", settingsRoutes as any);
    return app;
}

function createSettingsTx(existingSettings: Record<string, unknown>, capture: { merged?: Record<string, unknown> }) {
    return {
        insert: vi.fn(() => ({
            values: vi.fn(() => ({
                onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
            })),
        })),
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue([{ settings: existingSettings }]),
                })),
            })),
        })),
        update: vi.fn(() => ({
            set: vi.fn((value) => {
                capture.merged = value.settings;
                return {
                    where: vi.fn(() => ({
                        returning: vi.fn().mockResolvedValue([{ settings: value.settings }]),
                    })),
                };
            }),
        })),
    };
}

describe("settings route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("accepts nested partial settings patches used by the frontend and deep merges them", async () => {
        const capture: { merged?: Record<string, unknown> } = {};
        const existingSettings = {
            tasks: { hideCompleted: false, hideTrash: false, defaultDueDate: null },
            dateTime: { weekStart: "Sunday", timezone: "local", timeDisplay: "12h" },
            notifications: { email: true },
            shortcuts: {},
            preferredView: "list",
        };
        const tx = createSettingsTx(existingSettings, capture);

        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                tasks: { hideCompleted: true },
                dateTime: { timezone: "America/Toronto" },
                preferredView: "kanban",
            }),
        });

        expect(response.status).toBe(200);
        const body = await response.json() as any;
        expect(body.data).toEqual({
            tasks: { hideCompleted: true, hideTrash: false, defaultDueDate: null },
            dateTime: { weekStart: "Sunday", timezone: "America/Toronto", timeDisplay: "12h" },
            notifications: { email: true },
            shortcuts: {},
            preferredView: "kanban",
        });
        expect(capture.merged).toEqual(body.data);
    });

    it("returns structured validation errors for invalid settings payloads", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                "x-request-id": "req-settings-invalid",
            },
            body: JSON.stringify({
                notifications: { email: "yes" },
            }),
        });

        expect(response.status).toBe(400);
        expect(getDbClientMock).not.toHaveBeenCalled();

        const body = await response.json() as any;
        expect(body.error.code).toBe("INVALID_REQUEST");
        expect(body.error.requestId).toBe("req-settings-invalid");
        expect(body.error.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "notifications.email",
                }),
            ]),
        );
        expect(warnSpy).toHaveBeenCalled();
    });
});
