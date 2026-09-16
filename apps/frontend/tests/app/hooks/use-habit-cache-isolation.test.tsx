import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import { useCreateHabit } from "../../../app/hooks/habits/use-create-habit";
import { useUpdateHabit } from "../../../app/hooks/habits/use-update-habit";
import { queryKeys } from "../../../app/lib/api/query-keys";
const { post, patch } = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({ api: { habits: { $post: post, ":id": { $patch: patch } } } }) }));
vi.mock("../../../app/lib/api/offline-mutation", () => ({ withOfflineSupport: (_queue: unknown, online: unknown) => online }));
const habit = { id: "habit-1", title: "Walk", recurrenceRule: "FREQ=DAILY", archived: false } as Habit;
const weeklyKey = [...queryKeys.habits.weekly({ start: "2026-09-14", end: "2026-09-20" }), false];
function setup<T>(hook: () => T) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    client.setQueryData(queryKeys.habits.all, [habit]);
    client.setQueryData(weeklyKey, [habit]);
    const summary = [{ habitId: habit.id, actionableDates: ["2026-09-16"] }];
    const history = { scheduledDays: [16], logsByDay: { 16: "COMPLETED" } };
    client.setQueryData(queryKeys.habits.unresolved, summary);
    client.setQueryData(queryKeys.habits.monthly(habit.id, 2026, 8), history);
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { ...renderHook(hook, { wrapper }), client, summary, history };
}
beforeEach(() => vi.clearAllMocks());
function response(data: unknown) { return new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } }); }
describe("Habit cache isolation", () => {
    it("saves successive edits in order across hook instances", async () => {
        const { result } = setup(() => ({ first: useUpdateHabit(), second: useUpdateHabit() }));
        let finishFirst!: () => void;
        patch.mockImplementationOnce(() => new Promise<Response>((resolve) => {
            finishFirst = () => resolve(response({ ...habit, pausedUntil: "2026-09-23" }));
        })).mockImplementationOnce(async () => response({ ...habit, pausedUntil: null }));
        act(() => { result.current.first.mutate({ id: habit.id, pausedUntil: "2026-09-23" }); });
        await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
        act(() => { result.current.second.mutate({ id: habit.id, pausedUntil: null }); });
        await waitFor(() => expect(result.current.second.isPaused).toBe(true));
        expect(patch).toHaveBeenCalledTimes(1);
        await act(async () => finishFirst());
        await waitFor(() => expect(result.current.second.isSuccess).toBe(true));
        expect(patch).toHaveBeenCalledTimes(2);
    });
    it("does not put a newly created habit into summaries or monthly history", async () => {
        const { result, client, summary, history } = setup(useCreateHabit);
        post.mockImplementation(async () => {
            expect(client.getQueryData(queryKeys.habits.unresolved)).toEqual(summary);
            expect(client.getQueryData(queryKeys.habits.monthly(habit.id, 2026, 8))).toEqual(history);
            return response({ ...habit, id: "new-habit" });
        });
        await act(async () => { await result.current.mutateAsync({ title: "New", recurrenceRule: "FREQ=DAILY" }); });
        expect(client.getQueryData(queryKeys.habits.unresolved)).toEqual(summary);
    });
    it("can edit and restore a habit after monthly history has loaded", async () => {
        const { result, client, summary, history } = setup(useUpdateHabit);
        patch.mockResolvedValue(response({ ...habit, title: "Edited" }));
        await act(async () => { await result.current.mutateAsync({ id: habit.id, title: "Edited", archived: false }); });
        expect(client.getQueryData(queryKeys.habits.unresolved)).toEqual(summary);
        expect(client.getQueryData(queryKeys.habits.monthly(habit.id, 2026, 8))).toEqual(history);
        expect(client.getQueryData<Habit[]>(weeklyKey)?.[0].title).toBe("Edited");
    });
});
