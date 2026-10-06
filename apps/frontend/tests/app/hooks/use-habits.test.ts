import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../../app/lib/api/client";
import { habitsRangeQueryOptions } from "../../../app/hooks/habits/use-habits";
import { reconcileHabitInCaches } from "../../../app/lib/api/cache-sync";
import { makeHabit, testQueryClient } from "../../helpers";

vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({}) }));

describe("routine range identity", () => {
    it("keys a range by its LocalDates (no zone) while sharing reconciliation and archive matching", async () => {
        const get = vi.fn().mockImplementation(async () => Response.json({ data: [makeHabit()] }));
        const client = { api: { habits: { weekly: { $get: get } } } } as unknown as ApiClient;
        const qc = testQueryClient();
        const week = habitsRangeQueryOptions(client, { start: "2026-03-06", end: "2026-03-10" });
        const month = habitsRangeQueryOptions(client, { start: "2026-03-01", end: "2026-03-31" });
        await Promise.all([qc.fetchQuery(week), qc.fetchQuery(month)]);
        expect(get.mock.calls.map(([input]) => input.query)).toEqual([
            { start: "2026-03-06", end: "2026-03-10", archived: "false" },
            { start: "2026-03-01", end: "2026-03-31", archived: "false" },
        ]);
        expect(week.queryKey).not.toEqual(month.queryKey);
        const changed = makeHabit({ title: "Changed" });
        reconcileHabitInCaches(qc, changed);
        expect(qc.getQueryData(week.queryKey)?.[0].title).toBe("Changed");
        expect(qc.getQueryData(month.queryKey)?.[0].title).toBe("Changed");
        reconcileHabitInCaches(qc, { ...changed, archived: true });
        expect(qc.getQueryData(week.queryKey)).toEqual([]);
        expect(qc.getQueryData(month.queryKey)).toEqual([]);
        qc.clear();
    });
});
