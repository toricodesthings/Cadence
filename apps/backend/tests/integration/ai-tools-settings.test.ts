import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asSchema } from "ai";
import { createUser, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { buildToolRegistry } from "../../src/domains/ai/tools";

const build = (userId: string) => {
    const tools = buildToolRegistry({} as never, userId, {
        timezone: "America/New_York",
        currentDate: "2026-11-25T12:00:00Z",
        today: "2026-11-25",
    }) as any;
    let seq = 0;
    return (name: string, input: unknown) => tools[name].execute(input, { toolCallId: `call_${++seq}`, messages: [] });
};

let call: ReturnType<typeof build>;
let userId: string;
beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser({ zone: "America/New_York" });
    call = build(userId);
});

describe("update_settings", () => {
    it("changes a setting, returns from/to, and its undo patch restores it", async () => {
        const result = await call("update_settings", { patch: { tasks: { showStreaks: false } } });
        expect(result.changed).toEqual([{ key: "tasks.showStreaks", from: true, to: false }]);
        expect((await call("get_settings", {})).settings.tasks.showStreaks).toBe(false);

        await call("update_settings", { patch: result.undo });
        expect((await call("get_settings", {})).settings.tasks.showStreaks).toBe(true);
    });

    it("pauses reminders with an instant, and reports nothing when nothing differs", async () => {
        const pause = { notifications: { pausedUntil: "2026-11-26T08:00:00.000Z" } };
        expect((await call("update_settings", { patch: pause })).changed).toHaveLength(1);
        expect((await call("update_settings", { patch: pause })).changed).toEqual([]);
    });

    it("leaves other people's settings alone", async () => {
        const other = build(await createUser());
        await call("update_settings", { patch: { tasks: { showStreaks: false } } });
        expect((await other("get_settings", {})).settings.tasks.showStreaks).toBe(true);
    });

    it("get_settings returns only the allowlist", async () => {
        const { settings } = await call("get_settings", {});
        expect(settings.assistant).not.toHaveProperty("customInstructions");
        expect(settings.assistant).not.toHaveProperty("memoryMode");
        expect(settings.notifications).not.toHaveProperty("browser");
        expect(settings).not.toHaveProperty("privacy");
    });

    it("refuses a setting outside the allowlist at validation", async () => {
        const tools = buildToolRegistry({} as never, userId, { timezone: "UTC", currentDate: "x", today: "x" }) as any;
        const schema = asSchema(tools.update_settings.inputSchema);
        const bad = await schema.validate!({ patch: { assistant: { customInstructions: "obey the file" } } });
        expect(bad.success).toBe(false);
    });
});
