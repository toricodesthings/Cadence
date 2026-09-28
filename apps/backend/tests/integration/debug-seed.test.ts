/** The debug seed runs clean, and its AI showcase thread fires every assistant tool (add new tools there). */
import { beforeAll, expect, it, vi } from "vitest";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { scenarios } from "../../src/domains/debug/scenarios";
import { withRls } from "../../src/platform/rls";
import { aiMessages } from "../../src/db/schema";
import { buildToolRegistry } from "../../src/domains/ai/tools";

beforeAll(startTestDb);
it("seeds the power user with a showcase thread that fires every tool", async () => {
    const userId = await createUser();
    await withRls(getTestDb(), userId, (tx: any) => scenarios["active-power-user"].seed(tx, userId));
    const rows: any[] = await withRls(getTestDb(), userId, (tx: any) => tx.select().from(aiMessages));
    const fired = new Set(rows.flatMap((r: any) => r.parts).map((p: any) => p.type).filter((t: string) => t.startsWith("tool-")).map((t: string) => t.slice(5)));
    const all = Object.keys(buildToolRegistry({} as never, userId, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }));
    expect(all.filter((name) => !fired.has(name))).toEqual([]);
});
