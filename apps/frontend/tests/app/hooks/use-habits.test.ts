import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../../app/lib/api/client";
import { habitsRangeQueryOptions } from "../../../app/hooks/habits/use-habits";
import { reconcileHabitInCaches } from "../../../app/lib/api/cache-sync";
import { makeHabit, testQueryClient } from "../../helpers";

vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({}) }));

describe("routine range identity", () => {
    it("separates zones across DST while sharing reconciliation and archive matching", async () => {
        const get = vi.fn().mockImplementation(async () => Response.json({ data: [makeHabit()] }));
        const client = { api: { habits: { weekly: { $get: get } } } } as unknown as ApiClient;
        const qc = testQueryClient();
        const range = { start: "2026-03-06", end: "2026-03-10" };
        const ny = habitsRangeQueryOptions(client, { ...range, timezone: "America/New_York" });
        const tokyo = habitsRangeQueryOptions(client, { ...range, timezone: "Asia/Tokyo" });
        await Promise.all([qc.fetchQuery(ny), qc.fetchQuery(tokyo)]);
        expect(get.mock.calls.map(([input]) => input.query.timezone)).toEqual(["America/New_York", "Asia/Tokyo"]);
        expect(ny.queryKey).not.toEqual(tokyo.queryKey);
        const changed = makeHabit({ title: "Changed" });
        reconcileHabitInCaches(qc, changed);
        expect(qc.getQueryData(ny.queryKey)?.[0].title).toBe("Changed");
        expect(qc.getQueryData(tokyo.queryKey)?.[0].title).toBe("Changed");
        reconcileHabitInCaches(qc, { ...changed, archived: true });
        expect(qc.getQueryData(ny.queryKey)).toEqual([]);
        expect(qc.getQueryData(tokyo.queryKey)).toEqual([]);
        qc.clear();
    });
});
