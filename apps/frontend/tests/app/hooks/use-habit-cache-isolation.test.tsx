import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import { useUpdateHabit } from "../../../app/hooks/habits/use-update-habit";
import { queryKeys } from "../../../app/lib/api/query-keys";
import { testQueryClient, withClient } from "../../helpers";
const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({ api: { habits: { ":id": { $patch: patch } } } }) }));
vi.mock("../../../app/lib/api/offline-mutation", () => ({ withOfflineSupport: (_queue: unknown, online: unknown) => online }));
const habit = { id: "habit-1", title: "Walk", recurrenceRule: "FREQ=DAILY", archived: false } as Habit;
const weeklyKey = [...queryKeys.habits.weekly({ start: "2026-09-14", end: "2026-09-20" }), false];
function setup<T>(hook: () => T) {
    const client = testQueryClient();
    client.setQueryData(queryKeys.habits.all, [habit]);
    client.setQueryData(weeklyKey, [habit]);
    return { ...renderHook(hook, { wrapper: withClient(client) }), client };
}
beforeEach(() => vi.clearAllMocks());
const response = (data: unknown) => Response.json({ data });
describe("Habit cache isolation", () => {
    it("saves successive edits in order across hook instances", async () => {
        const { result } = setup(() => ({ first: useUpdateHabit(), second: useUpdateHabit() }));
        const first = Promise.withResolvers<Response>();
        patch.mockReturnValueOnce(first.promise).mockImplementationOnce(async () => response({ ...habit, pausedUntil: null }));
        act(() => { result.current.first.mutate({ id: habit.id, pausedUntil: "2026-09-23" }); });
        await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
        act(() => { result.current.second.mutate({ id: habit.id, pausedUntil: null }); });
        await waitFor(() => expect(result.current.second.isPaused).toBe(true));
        expect(patch).toHaveBeenCalledTimes(1);
        await act(async () => first.resolve(response({ ...habit, pausedUntil: "2026-09-23" })));
        await waitFor(() => expect(result.current.second.isSuccess).toBe(true));
        expect(patch).toHaveBeenCalledTimes(2);
    });
    it("can edit and restore a habit", async () => {
        const { result, client } = setup(useUpdateHabit);
        patch.mockResolvedValue(response({ ...habit, title: "Edited" }));
        await act(async () => { await result.current.mutateAsync({ id: habit.id, title: "Edited", archived: false }); });
        expect(client.getQueryData<Habit[]>(weeklyKey)?.[0].title).toBe("Edited");
    });
});
