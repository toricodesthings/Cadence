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
import { SETTINGS_DEFAULTS } from "../../src/types/settings-defaults";

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
            calendar: {
                holidays: {
                    enabled: true,
                    usePreciseLocation: false,
                    locationMode: "auto",
                    countryCode: null,
                    subdivisionCode: null,
                    promptDismissedAt: null,
                },
            },
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
                calendar: {
                    holidays: {
                        locationMode: "manual",
                        countryCode: "CA",
                        subdivisionCode: "CA-ON",
                        promptDismissedAt: "2026-03-11T15:00:00.000Z",
                    },
                },
                preferredView: "kanban",
            }),
        });

        expect(response.status).toBe(200);
        const body = await response.json() as any;
        // New fields from defaults should be present along with the patched values
        expect(body.data.tasks.hideCompleted).toBe(true);
        expect(body.data.tasks.hideTrash).toBe(false);
        expect(body.data.dateTime.timezone).toBe("America/Toronto");
        expect(body.data.calendar.holidays.locationMode).toBe("manual");
        expect(body.data.calendar.holidays.countryCode).toBe("CA");
        expect(body.data.preferredView).toBe("kanban");
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

    it("GET normalizes missing sections against canonical defaults", async () => {
        // User has only old-style settings (tasks, dateTime basic)
        const existingSettings = {
            tasks: { hideCompleted: false, hideTrash: true, defaultDueDate: "Today" },
            dateTime: { weekStart: "Monday", timezone: "local", timeDisplay: "24h" },
            notifications: { email: false },
        };
        const tx = createSettingsTx(existingSettings, {});
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", { method: "GET" });

        expect(response.status).toBe(200);
        const body = await response.json() as any;

        // Existing values preserved
        expect(body.data.tasks.hideTrash).toBe(true);
        expect(body.data.tasks.defaultDueDate).toBe("Today");
        expect(body.data.dateTime.weekStart).toBe("Monday");
        expect(body.data.notifications.email).toBe(false);

        // New sections filled from defaults
        expect(body.data.appearance).toEqual(SETTINGS_DEFAULTS.appearance);
        expect(body.data.privacy).toEqual(SETTINGS_DEFAULTS.privacy);
        expect(body.data.integrations).toEqual(SETTINGS_DEFAULTS.integrations);
        expect(body.data.shortcuts).toEqual(SETTINGS_DEFAULTS.shortcuts);
        expect(body.data.calendar.defaultView).toBe("month");
        expect(body.data.calendar.showWeekNumbers).toBe(false);
        expect(body.data.calendar.showWeekends).toBe(true);
        expect(body.data.tasks.defaultView).toBe("list");
        expect(body.data.tasks.defaultPriority).toBe("none");
        expect(body.data.notifications.quietHoursEnabled).toBe(false);
        expect(body.data.dateTime.dateStyle).toBe("mdy");
    });

    it("migrates legacy preferredView into tasks.defaultView", async () => {
        const existingSettings = {
            tasks: { hideCompleted: false, hideTrash: false, defaultDueDate: null },
            preferredView: "kanban",
        };
        const tx = createSettingsTx(existingSettings, {});
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", { method: "GET" });

        expect(response.status).toBe(200);
        const body = await response.json() as any;

        // Legacy preferredView should be migrated to tasks.defaultView
        expect(body.data.tasks.defaultView).toBe("kanban");
    });

    it("does not overwrite tasks.defaultView if it already exists", async () => {
        const existingSettings = {
            tasks: { hideCompleted: false, hideTrash: false, defaultDueDate: null, defaultView: "list" },
            preferredView: "kanban",
        };
        const tx = createSettingsTx(existingSettings, {});
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", { method: "GET" });

        expect(response.status).toBe(200);
        const body = await response.json() as any;

        // tasks.defaultView takes precedence over preferredView
        expect(body.data.tasks.defaultView).toBe("list");
    });

    it("accepts new appearance settings patch", async () => {
        const capture: { merged?: Record<string, unknown> } = {};
        const existingSettings = {};
        const tx = createSettingsTx(existingSettings, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                appearance: { theme: "daylight", density: "compact" },
            }),
        });

        expect(response.status).toBe(200);
        const body = await response.json() as any;
        expect(body.data.appearance.theme).toBe("daylight");
        expect(body.data.appearance.density).toBe("compact");
        // Defaults should be preserved for unpatched fields
        expect(body.data.appearance.motion).toBe("system");
        expect(body.data.appearance.accentIntensity).toBe("balanced");
    });

    it("accepts privacy and integrations patches", async () => {
        const capture: { merged?: Record<string, unknown> } = {};
        const existingSettings = {};
        const tx = createSettingsTx(existingSettings, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                privacy: { usageDiagnostics: false, exportFormat: "csv" },
                integrations: { googleCalendar: { enabled: true, syncMode: "two_way" } },
            }),
        });

        expect(response.status).toBe(200);
        const body = await response.json() as any;
        expect(body.data.privacy.usageDiagnostics).toBe(false);
        expect(body.data.privacy.exportFormat).toBe("csv");
        expect(body.data.privacy.crashReports).toBe(true); // default preserved
        expect(body.data.integrations.googleCalendar.enabled).toBe(true);
        expect(body.data.integrations.googleCalendar.syncMode).toBe("two_way");
    });

    it("accepts shortcuts structured patch", async () => {
        const capture: { merged?: Record<string, unknown> } = {};
        const existingSettings = {};
        const tx = createSettingsTx(existingSettings, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                shortcuts: { enabled: false, bindings: { newTask: "n" } },
            }),
        });

        expect(response.status).toBe(200);
        const body = await response.json() as any;
        expect(body.data.shortcuts.enabled).toBe(false);
        expect(body.data.shortcuts.bindings.newTask).toBe("n");
        expect(body.data.shortcuts.bindings.commandPalette).toBe("mod+k"); // default preserved
    });

    it("rejects invalid enum values for new settings", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                appearance: { theme: "neon" },
            }),
        });

        expect(response.status).toBe(400);
        warnSpy.mockRestore();
    });

    it("accepts quiet hours settings", async () => {
        const capture: { merged?: Record<string, unknown> } = {};
        const existingSettings = {};
        const tx = createSettingsTx(existingSettings, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();
        const response = await app.request("http://localhost/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                notifications: { quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
            }),
        });

        expect(response.status).toBe(200);
        const body = await response.json() as any;
        expect(body.data.notifications.quietHoursEnabled).toBe(true);
        expect(body.data.notifications.quietHoursStart).toBe("22:00");
        expect(body.data.notifications.quietHoursEnd).toBe("07:00");
    });
});
