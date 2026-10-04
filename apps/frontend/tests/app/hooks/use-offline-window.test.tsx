import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOfflineWindow } from "../../../app/hooks/core/use-offline-window";
import { testQueryClient, withClient } from "../../helpers";

const { client, read, options } = vi.hoisted(() => {
    const read = vi.fn<() => Promise<unknown>>();
    return {
        client: { api: { tasks: { batch: { $get: async (input: { query: { queries: string } }) => {
            await read();
            return Response.json({ data: { tasks: [], lists: JSON.parse(input.query.queries).map(() => []) } });
        } } } } }, read,
        options: (domain: string, filters?: unknown) => ({
            queryKey: [domain, filters ?? null], queryFn: () => read(),
        }),
    };
});
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => client }));
vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: { dateTime: { weekStart: "Monday" } } }),
}));
vi.mock("../../../app/hooks/tasks/use-tasks", () => ({
    tasksQueryOptions: (_client: unknown, filters: unknown) => options("tasks", filters),
}));
vi.mock("../../../app/hooks/habits/use-habits", () => ({
    habitsRangeQueryOptions: (_client: unknown, filters: unknown) => options("habits", filters),
}));
vi.mock("../../../app/hooks/inbox/use-inbox", () => ({ inboxQueryOptions: () => options("inbox") }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ projectsQueryOptions: () => options("projects") }));
vi.mock("../../../app/hooks/tags/use-tags", () => ({ tagsQueryOptions: () => options("tags") }));

let pending: ReturnType<typeof Promise.withResolvers<unknown>>[];
let visible: boolean;
let online: boolean;

beforeEach(() => {
    visible = online = true;
    pending = [];
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    read.mockReset().mockImplementation(() => {
        const request = Promise.withResolvers<unknown>();
        pending.push(request);
        return request.promise;
    });
});

function setup() {
    const queryClient = testQueryClient();
    return { queryClient, ...renderHook(useOfflineWindow, { wrapper: withClient(queryClient) }) };
}

describe("offline window background requests", () => {
    it("bounds the initial load and warms the rest as requests finish, keeping fresh data cached", async () => {
        const { queryClient, unmount } = setup();
        await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
        act(() => {
            window.dispatchEvent(new Event("online"));
            document.dispatchEvent(new Event("visibilitychange"));
        });
        expect(read).toHaveBeenCalledTimes(3);

        await act(async () => pending[0].resolve([]));
        await waitFor(() => expect(read).toHaveBeenCalledTimes(4));
        expect(queryClient.isFetching()).toBe(3);

        read.mockResolvedValue([]);
        await act(async () => pending.slice(1).forEach((request) => request.resolve([])));
        await waitFor(() => expect(queryClient.isFetching()).toBe(0));
        expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(10);
        const calls = read.mock.calls.length;
        await act(async () => document.dispatchEvent(new Event("visibilitychange")));
        expect(read).toHaveBeenCalledTimes(calls);
        unmount();
        queryClient.clear();
    });

    it("stops queued requests while hidden or offline, and finishes warming when visible and online", async () => {
        const { queryClient, unmount } = setup();
        await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
        visible = false;
        await act(async () => pending.forEach((request) => request.resolve([])));
        await waitFor(() => expect(queryClient.isFetching()).toBe(0));
        expect(read).toHaveBeenCalledTimes(3);

        visible = true;
        online = false;
        await act(async () => document.dispatchEvent(new Event("visibilitychange")));
        expect(read).toHaveBeenCalledTimes(3);

        online = true;
        read.mockResolvedValue([]);
        await act(async () => window.dispatchEvent(new Event("online")));
        await waitFor(() => expect(queryClient.isFetching()).toBe(0));
        expect(read.mock.calls.length).toBeGreaterThan(10);
        unmount();
        queryClient.clear();
    });

    it("does not start the rest of an account's requests after its workspace unmounts", async () => {
        const { queryClient, unmount } = setup();
        await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
        unmount();
        await act(async () => pending.forEach((request) => request.resolve([])));
        await waitFor(() => expect(queryClient.isFetching()).toBe(0));
        expect(read).toHaveBeenCalledTimes(3);
        queryClient.clear();
    });
});
