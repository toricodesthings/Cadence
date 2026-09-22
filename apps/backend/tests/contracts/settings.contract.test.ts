import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/app";

const { getDbClientMock, withRlsMock } = vi.hoisted(() => ({
    getDbClientMock: vi.fn(),
    withRlsMock: vi.fn(),
}));
const { checkIdempotencyMock, recordMutationMock, getIdempotencyKeyMock } = vi.hoisted(() => ({
    checkIdempotencyMock: vi.fn().mockResolvedValue(null),
    recordMutationMock: vi.fn().mockResolvedValue(undefined),
    getIdempotencyKeyMock: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../src/platform/db", () => ({
    getDbClient: getDbClientMock,
}));

vi.mock("../../src/platform/rls", () => ({
    withRls: withRlsMock,
}));

vi.mock("../../src/platform/idempotency", () => ({
    checkIdempotency: checkIdempotencyMock,
    recordMutation: recordMutationMock,
    getIdempotencyKey: getIdempotencyKeyMock,
}));

import { settingsRoutes } from "../../src/domains/settings/settings.route";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";

function createSettingsApp() {
    return createTestApp("/settings", settingsRoutes);
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

function createFocusViewTx(rows: unknown[], capture: { insert?: Record<string, unknown>; update?: Record<string, unknown>; deleted?: boolean }) {
    const makeRowsResult = (value: unknown[]) => ({
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(value)),
        orderBy: vi.fn().mockResolvedValue(value),
        limit: vi.fn().mockResolvedValue(value),
    });

    return {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    ...makeRowsResult(rows),
                })),
            })),
        })),
        insert: vi.fn(() => ({
            values: vi.fn((value: Record<string, unknown>) => {
                capture.insert = value;
                return {
                    returning: vi.fn().mockResolvedValue([{ id: "focus-1", ...value }]),
                };
            }),
        })),
        update: vi.fn(() => ({
            set: vi.fn((value: Record<string, unknown>) => {
                capture.update = value;
                return {
                    where: vi.fn(() => ({
                        returning: vi.fn().mockResolvedValue([{ id: "focus-1", ...value }]),
                    })),
                };
            }),
        })),
        delete: vi.fn(() => ({
            where: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue(rows),
            })),
        })),
    };
}

describe("settings route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        checkIdempotencyMock.mockResolvedValue(null);
        getIdempotencyKeyMock.mockReturnValue(undefined);
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
                location: {
                    mode: "manual",
                    countryCode: "CA",
                    subdivisionCode: "CA-ON",
                    promptDismissedAt: "2026-03-11T15:00:00.000Z",
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
        expect(body.data.location).toEqual({
            mode: "manual",
            countryCode: "CA",
            subdivisionCode: "CA-ON",
            city: null,
            promptDismissedAt: "2026-03-11T15:00:00.000Z",
        });
        expect(body.data.calendar.holidays.enabled).toBe(true);
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
        expect(body.error.requestId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
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

    it.each([
        {
            section: "appearance",
            patch: { appearance: { theme: "daylight", density: "compact" } },
            expected: { appearance: { theme: "daylight", density: "compact", motion: "system", accentIntensity: "balanced" } },
        },
        {
            section: "privacy + integrations",
            patch: {
                privacy: { usageDiagnostics: false, exportFormat: "csv" },
                integrations: { googleCalendar: { enabled: true, syncMode: "two_way" } },
            },
            expected: {
                privacy: { usageDiagnostics: false, exportFormat: "csv", crashReports: true },
                integrations: { googleCalendar: { enabled: true, syncMode: "two_way" } },
            },
        },
        {
            section: "shortcuts",
            patch: { shortcuts: { enabled: false, bindings: { newTask: "n" } } },
            expected: { shortcuts: { enabled: false, bindings: { newTask: "n", commandPalette: "mod+k" } } },
        },
        {
            section: "quiet hours",
            patch: { notifications: { quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" } },
            expected: { notifications: { quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" } },
        },
    ])("merges a $section patch over the defaults, keeping unpatched defaults", async ({ patch, expected }) => {
        const tx = createSettingsTx({}, {});
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const response = await createSettingsApp().request("http://localhost/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
        });

        expect(response.status).toBe(200);
        expect(((await response.json()) as any).data).toMatchObject(expected);
    });

    it("rejects invalid enum values for new settings", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const response = await createSettingsApp().request("http://localhost/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ appearance: { theme: "neon" } }),
        });

        expect(response.status).toBe(400);
    });

    it("lists and mutates saved focus views", async () => {
        const capture: { insert?: Record<string, unknown>; update?: Record<string, unknown> } = {};
        const focusViewId = "33333333-3333-4333-8333-333333333333";
        const rows = [{
            id: focusViewId,
            userId: "11111111-1111-4111-8111-111111111111",
            name: "Quick Wins",
            definition: {
                states: ["ACTIVE"],
                projectIds: [],
                tagIds: [],
                needsDate: false,
                needsProject: false,
                priorityMin: null,
                effortMax: 1,
                dueWindow: null,
                waitingOnly: false,
                missingStructureOnly: false,
                sortMode: "smart",
            },
            isPinned: true,
            source: "manual",
            orderIndex: 0,
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
        }];
        const tx = createFocusViewTx(rows, capture);
        getDbClientMock.mockReturnValue(tx);
        withRlsMock.mockImplementation(async (_db, _userId, callback) => callback(tx));

        const app = createSettingsApp();

        const listResponse = await app.request("http://localhost/settings/focus-views");
        expect(listResponse.status).toBe(200);
        const listBody = await listResponse.json() as any;
        expect(listBody.data).toHaveLength(1);
        expect(listBody.data[0].name).toBe("Quick Wins");

        const createResponse = await app.request("http://localhost/settings/focus-views", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                name: "Due Soon",
                definition: rows[0].definition,
            }),
        });
        expect(createResponse.status).toBe(201);
        expect(capture.insert).toMatchObject({
            name: "Due Soon",
            source: "manual",
        });

        const patchResponse = await app.request(`http://localhost/settings/focus-views/${focusViewId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                name: "Quick Wins (Pinned)",
            }),
        });
        expect(patchResponse.status).toBe(200);
        expect(capture.update).toMatchObject({
            name: "Quick Wins (Pinned)",
        });
    });
});
