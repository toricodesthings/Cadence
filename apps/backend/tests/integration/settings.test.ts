import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { meRoutes } from "../../src/domains/account/me.route";
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
    it("wipes NLP parses, dismissals, and inbox analysis for the caller only", async () => {
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
            inbox: (await pg.query("SELECT analysis_status, analysis_summary FROM inbox_items WHERE id = $1", [item.data.id])).rows[0],
        }));
        expect(counts).toEqual({ metadata: 0, inbox: { analysis_status: "pending", analysis_summary: null } });
        expect((await settings("GET", "")).body.data.tasks.intelligence.dismissedEntityIds).toEqual([]);
        expect((await settings("GET", "/notification-state")).body.data).toEqual([]);
        expect((await tasks("GET", `/${task.data.id}`)).status).toBe(200);
        expect((await otherSettings("GET", "")).body.data.tasks.intelligence.dismissedEntityIds).toEqual(["project:2"]);
    });
});

describe("the user's time zone", () => {
    const storedZone = async (id = userId) => (await asOwner(async (pg) => (await pg.query<{ time_zone: string }>("SELECT time_zone FROM users WHERE id = $1", [id])).rows))[0].time_zone;
    let me: ReturnType<typeof apiAs>;
    beforeEach(() => { me = apiAs(userId, "/me", meRoutes); });

    it("a new user's zone is UTC until the device reports one", async () => {
        expect(await storedZone()).toBe("UTC");
    });

    it("PUT /me/time-zone stores a valid IANA zone and answers with it", async () => {
        const { status, body } = await me("PUT", "/time-zone", { timeZone: "Asia/Tokyo" });

        expect(status).toBe(200);
        expect(body.data).toEqual({ timeZone: "Asia/Tokyo" });
        expect(await storedZone()).toBe("Asia/Tokyo");
        expect((await me("PUT", "/time-zone", { timeZone: "America/Toronto" })).body.data.timeZone).toBe("America/Toronto");
        expect(await storedZone()).toBe("America/Toronto");
    });

    it.each(["local", "device", "+05:00", "UTC+5", "EST5EDT-garbage", "not a zone", ""])("rejects %j with 400 and keeps the stored zone", async (timeZone) => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        await me("PUT", "/time-zone", { timeZone: "Asia/Tokyo" });

        expect((await me("PUT", "/time-zone", { timeZone })).status).toBe(400);
        expect(await storedZone()).toBe("Asia/Tokyo");
    });

    it("rejects a missing or non-string zone", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        expect((await me("PUT", "/time-zone", {})).status).toBe(400);
        expect((await me("PUT", "/time-zone", { timeZone: 5 })).status).toBe(400);
    });

    it("only changes the caller's own zone", async () => {
        const other = await createUser();
        await me("PUT", "/time-zone", { timeZone: "Asia/Tokyo" });

        expect(await storedZone(other)).toBe("UTC");
    });

    it("a zone pinned in Settings wins over a device report", async () => {
        await settings("PATCH", "", { dateTime: { timezone: "America/Toronto" } });

        const { body } = await me("PUT", "/time-zone", { timeZone: "Asia/Tokyo" });

        expect(body.data.timeZone).toBe("America/Toronto");
        expect(await storedZone()).toBe("America/Toronto");
    });

    it("with Settings on \"device\", the device report is the zone", async () => {
        await settings("PATCH", "", { dateTime: { timezone: "America/Toronto" } });
        await settings("PATCH", "", { dateTime: { timezone: "device" } });

        // Choosing "device" leaves the last zone in place until the client's next report.
        expect(await storedZone()).toBe("America/Toronto");
        expect((await me("PUT", "/time-zone", { timeZone: "Asia/Tokyo" })).body.data.timeZone).toBe("Asia/Tokyo");
        expect(await storedZone()).toBe("Asia/Tokyo");
    });

    it("PATCH settings with an IANA timezone sets users.time_zone at once", async () => {
        await settings("PATCH", "", { dateTime: { timezone: "Pacific/Auckland" } });

        expect(await storedZone()).toBe("Pacific/Auckland");
        expect((await settings("GET", "")).body.data.dateTime.timezone).toBe("Pacific/Auckland");
    });

    it("a stored legacy \"local\" reads back as \"device\", and a patch to \"local\" is stored as \"device\"", async () => {
        const legacy = await createUser({ dateTime: { timezone: "local" } });
        const legacySettings = apiAs(legacy, "/settings", settingsRoutes);

        expect((await legacySettings("GET", "")).body.data.dateTime.timezone).toBe("device");
        expect(await storedZone(legacy)).toBe("UTC");
        expect((await legacySettings("PATCH", "", { dateTime: { timezone: "local" } })).body.data.dateTime.timezone).toBe("device");
        expect(await storedZone(legacy)).toBe("UTC");
    });

    it("rejects an offset or garbage as the Settings timezone", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        expect((await settings("PATCH", "", { dateTime: { timezone: "+05:00" } })).status).toBe(400);
        expect((await settings("PATCH", "", { dateTime: { timezone: "nowhere" } })).status).toBe(400);
        expect(await storedZone()).toBe("UTC");
    });
});
