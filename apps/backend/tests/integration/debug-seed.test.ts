/** The debug seed runs clean, and its AI showcase thread fires every assistant tool (add new tools there). */
import { beforeAll, expect, it, vi } from "vitest";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";
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

it("seeds days as days and timed blocks as instants planned in the user's zone", async () => {
    const userId = await createUser();
    await withRls(getTestDb(), userId, (tx: any) => scenarios["active-power-user"].seed(tx, userId));
    const { rows } = await asOwner((pg) => pg.query<{ due_on: string | null; scheduled_start: string | null; zone: string | null; hidden_until: string | null }>(
        "SELECT due_on::text, scheduled_start::text, zone, hidden_until::text FROM tasks WHERE user_id = $1", [userId]));
    const timed = rows.filter((r) => r.scheduled_start);
    expect(rows.some((r) => r.due_on)).toBe(true);
    expect(timed.length).toBeGreaterThan(0);
    expect(timed.every((r) => r.zone === "UTC")).toBe(true); // the seeded user's own zone
    expect(rows.filter((r) => r.hidden_until).every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.hidden_until!))).toBe(true);
    expect((await asOwner((pg) => pg.query("SELECT time_zone FROM users WHERE id = $1", [userId]))).rows[0]).toEqual({ time_zone: "UTC" });
});
