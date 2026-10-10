import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const wal: { status: string }[] = [];
vi.mock("../../../app/lib/api/offline-wal", () => ({ getWalSnapshot: () => wal }));

import { LOCAL_REFRESH_MS, useLocalReminderRefresh } from "../../../app/hooks/notifications/use-local-reminder-refresh";

let client: QueryClient;
let refetch: MockInstance<QueryClient["refetchQueries"]>;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const refreshedKeys = () => refetch.mock.calls.map(([filters]) => filters?.queryKey);

beforeEach(() => {
    vi.useFakeTimers();
    wal.length = 0;
    client = new QueryClient();
    refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue();
});
afterEach(() => vi.useRealTimers());

describe("useLocalReminderRefresh", () => {
    it("re-reads what reminders come from every couple of minutes while this device alerts by itself", () => {
        const { unmount } = renderHook(() => useLocalReminderRefresh(true, "u1"), { wrapper });
        vi.advanceTimersByTime(LOCAL_REFRESH_MS - 1);
        expect(refetch).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(refreshedKeys()).toEqual([
            ["tasks", { state: "ACTIVE" }],
            ["tasks", { state: "WAITING" }],
            ["habits", "weekly", expect.objectContaining({ start: expect.any(String) })],
            ["settings", "u1"],
        ]);
        unmount();
        vi.advanceTimersByTime(LOCAL_REFRESH_MS);
        expect(refetch).toHaveBeenCalledTimes(4);
    });

    it("does nothing where the server pushes (or nobody is signed in)", () => {
        renderHook(() => useLocalReminderRefresh(false, "u1"), { wrapper });
        renderHook(() => useLocalReminderRefresh(true, undefined), { wrapper });
        vi.advanceTimersByTime(LOCAL_REFRESH_MS * 3);
        expect(refetch).not.toHaveBeenCalled();
    });

    it("waits while writes are queued or in flight, so it never undoes them on screen", () => {
        renderHook(() => useLocalReminderRefresh(true, "u1"), { wrapper });
        wal.push({ status: "pending" });
        vi.advanceTimersByTime(LOCAL_REFRESH_MS);
        expect(refetch).not.toHaveBeenCalled();

        wal.length = 0;
        const mutating = vi.spyOn(client, "isMutating").mockReturnValue(1);
        vi.advanceTimersByTime(LOCAL_REFRESH_MS);
        expect(refetch).not.toHaveBeenCalled();

        mutating.mockReturnValue(0);
        vi.advanceTimersByTime(LOCAL_REFRESH_MS);
        expect(refetch).toHaveBeenCalledTimes(4);
    });
});
