import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { buildToolRegistry } from "../../src/domains/ai/tools";
let run: (args: any) => Promise<any>;
let inbox: ReturnType<typeof apiAs>;
beforeAll(startTestDb);
beforeEach(async () => {
    const id = await createUser();
    inbox = apiAs(id, "/inbox", inboxRoutes);
    const registry = buildToolRegistry({} as any, id, { timezone: "America/New_York", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23", weekStart: "Monday" }) as any;
    run = args => registry.get_inbox_items.execute(args, { toolCallId: "test", messages: [] });
});
it("reads only live thoughts and explicitly marked notes, never discarded captures", async () => {
    const thought = (await inbox("POST", "", { rawText: "Buy milk" })).body.data;
    const note = (await inbox("POST", "", { rawText: "An idea" })).body.data;
    const discarded = (await inbox("POST", "", { rawText: "Ignore this" })).body.data;
    await inbox("PATCH", `/${note.id}`, { captureStatus: "kept" });
    await inbox("PATCH", `/${discarded.id}`, { captureStatus: "discarded" });
    const result = await run({ includeProcessed: false, limit: 20 });
    expect(result.items.map((i: any) => i.id).sort()).toEqual([thought.id, note.id].sort());
    expect(result.items.find((i: any) => i.id === note.id).isNote).toBe(true);
});
