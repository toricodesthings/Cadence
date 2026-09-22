import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { settingsRoutes } from "../../src/domains/settings/settings.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

const OBJECT_ID = "44444444-4444-4444-8444-444444444444";
const FOCUS_DEFINITION = {
    states: ["ACTIVE"],
    needsDate: false,
    needsProject: false,
    priorityMin: null,
    effortMax: 1,
    dueWindow: null,
    waitingOnly: false,
    missingStructureOnly: false,
    sortMode: "smart",
};

let userId: string;
let settings: ReturnType<typeof apiAs>;
let otherSettings: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser();
    settings = apiAs(userId, "/settings", settingsRoutes);
    otherSettings = apiAs(await createUser(), "/settings", settingsRoutes);
});

describe("reading and patching settings", () => {
    it("serves a new user's stored defaults filled out to the full canonical shape", async () => {
        const { status, body } = await settings("GET", "");

        expect(status).toBe(200);
        expect(body.data.appearance).toEqual(SETTINGS_DEFAULTS.appearance);
        expect(body.data.location.mode).toBe("approximate");
        expect(body.data.notifications.email).toBe(true);
    });

    it("deep-merges a patch, persists it, and leaves every other value alone", async () => {
        await settings("PATCH", "", { tasks: { hideCompleted: true }, dateTime: { timezone: "America/Toronto" } });

        const { body } = await settings("GET", "");

        expect(body.data.tasks.hideCompleted).toBe(true);
        expect(body.data.tasks.hideTrash).toBe(false);
        expect(body.data.dateTime).toMatchObject({ timezone: "America/Toronto", weekStart: "Sunday" });
    });

    it("rejects an invalid patch with field-level issues and saves nothing", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});

        const { status, body } = await settings("PATCH", "", { notifications: { email: "yes" }, tasks: { hideCompleted: true } });

        expect(status).toBe(400);
        expect(body.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: "notifications.email" })]));
        expect((await settings("GET", "")).body.data.tasks.hideCompleted).toBe(false);
    });

    it("never lets a patch create a background photo (only the upload route can)", async () => {
        const { body } = await settings("PATCH", "", {
            appearance: { backgroundMode: "image", backgroundImage: { id: "22222222-2222-4222-8222-222222222222", blur: 10 } },
        });

        expect(body.data.appearance.backgroundImage).toBeNull();
        expect(body.data.appearance.backgroundMode).not.toBe("image");
    });

    it("keeps each user's settings separate", async () => {
        await settings("PATCH", "", { weather: { enabled: false } });

        expect((await otherSettings("GET", "")).body.data.weather.enabled).toBe(true);
    });
});

describe("saved focus views", () => {
    it("creates a view (manual by default) and lists pinned views first", async () => {
        await settings("POST", "/focus-views", { name: "Later", definition: FOCUS_DEFINITION, orderIndex: 0 });
        const { status, body } = await settings("POST", "/focus-views", { name: "Quick Wins", definition: FOCUS_DEFINITION, isPinned: true, orderIndex: 5 });

        expect(status).toBe(201);
        expect(body.data.source).toBe("manual");
        expect((await settings("GET", "/focus-views")).body.data.map((v: any) => v.name)).toEqual(["Quick Wins", "Later"]);
    });

    it("renames and deletes a view", async () => {
        const { body: view } = await settings("POST", "/focus-views", { name: "Old", definition: FOCUS_DEFINITION });

        expect((await settings("PATCH", `/focus-views/${view.data.id}`, { name: "New" })).body.data.name).toBe("New");
        expect((await settings("DELETE", `/focus-views/${view.data.id}`)).status).toBe(200);
        expect((await settings("GET", "/focus-views")).body.data).toEqual([]);
    });

    it("treats another user's view as not found for update and delete", async () => {
        const { body: theirs } = await otherSettings("POST", "/focus-views", { name: "Theirs", definition: FOCUS_DEFINITION });

        expect((await settings("PATCH", `/focus-views/${theirs.data.id}`, { name: "hijacked" })).status).toBe(404);
        expect((await settings("DELETE", `/focus-views/${theirs.data.id}`)).status).toBe(404);
        expect((await otherSettings("GET", "/focus-views")).body.data.map((v: any) => v.name)).toEqual(["Theirs"]);
    });
});

describe("notification state", () => {
    it("upserts per object and trigger: counts presentations, keeps the first time, records the dismissal", async () => {
        const key = { objectType: "task", objectId: OBJECT_ID, triggerId: "due_date_reminder" };
        await settings("POST", "/notification-state", { ...key, firstPresentedAt: "2026-03-09T09:00:00.000Z", lastPresentedAt: "2026-03-09T09:00:00.000Z", presentationCountIncrement: 1 });
        await settings("POST", "/notification-state", { ...key, firstPresentedAt: "2026-03-10T09:00:00.000Z", lastPresentedAt: "2026-03-10T09:00:00.000Z", presentationCountIncrement: 1 });
        await settings("POST", "/notification-state", { ...key, dismissedAt: "2026-03-10T09:05:00.000Z" });

        const { body } = await settings("GET", "/notification-state");

        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({
            presentationCount: 2,
            triggerId: "due_date_reminder",
            firstPresentedAt: "2026-03-09T09:00:00.000Z",
            lastPresentedAt: "2026-03-10T09:00:00.000Z",
            dismissedAt: "2026-03-10T09:05:00.000Z",
        });
        expect((await otherSettings("GET", "/notification-state")).body.data).toEqual([]);
    });
});

describe("clearing intelligence history", () => {
    it("wipes NLP history, dismissals, and inbox analysis for the caller only", async () => {
        const tasks = apiAs(userId, "/tasks", taskRoutes);
        const inbox = apiAs(userId, "/inbox", inboxRoutes);
        const { body: task } = await tasks("POST", "", { title: "T", orderIndex: 1, nlp: { rawInput: "T tomorrow", sourceSurface: "quick_add", dateStyle: "mdy" } });
        await tasks("POST", `/${task.data.id}/reparse`, { rawInput: "T friday" });
        const { body: item } = await inbox("POST", "", { rawText: "analyzed" });
        await inbox("PATCH", `/${item.data.id}`, { analysisStatus: "parsed", analysisSummary: "summary" });
        await settings("PATCH", "", { tasks: { intelligence: { dismissedEntityIds: ["project:1"] } } });
        await settings("POST", "/notification-state", { objectType: "task", objectId: OBJECT_ID, triggerId: "t" });
        await otherSettings("PATCH", "", { tasks: { intelligence: { dismissedEntityIds: ["project:2"] } } });

        expect((await settings("POST", "/intelligence-history/clear")).body.data).toEqual({ cleared: true });

        const counts = await asOwner(async (pg) => ({
            metadata: (await pg.query<{ n: number }>("SELECT count(*)::int n FROM task_nlp_metadata WHERE user_id = $1", [userId])).rows[0].n,
            history: (await pg.query<{ n: number }>("SELECT count(*)::int n FROM task_nlp_metadata_history WHERE user_id = $1", [userId])).rows[0].n,
            inbox: (await pg.query("SELECT analysis_status, analysis_summary FROM inbox_items WHERE id = $1", [item.data.id])).rows[0],
        }));
        expect(counts).toEqual({ metadata: 0, history: 0, inbox: { analysis_status: "pending", analysis_summary: null } });
        expect((await settings("GET", "")).body.data.tasks.intelligence.dismissedEntityIds).toEqual([]);
        expect((await settings("GET", "/notification-state")).body.data).toEqual([]);
        expect((await tasks("GET", `/${task.data.id}`)).status).toBe(200);
        expect((await otherSettings("GET", "")).body.data.tasks.intelligence.dismissedEntityIds).toEqual(["project:2"]);
    });
});
