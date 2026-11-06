import { afterEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWakeRefresh, WAKE_EVENT } from "../../../app/hooks/core/use-wake-refresh";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("refreshes only when a tick arrives far later than scheduled (the computer slept)", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue();
    const woke = vi.fn();
    window.addEventListener(WAKE_EVENT, woke);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { unmount } = renderHook(() => useWakeRefresh(), { wrapper });

    vi.advanceTimersByTime(30_000 * 4);
    expect(refetch).not.toHaveBeenCalled();

    // Sleep: the clock jumps ten minutes while no timer ran.
    vi.setSystemTime(Date.now() + 10 * 60_000);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.advanceTimersByTime(30_000);
    expect(refetch).toHaveBeenCalledOnce();
    expect(woke).toHaveBeenCalledOnce();

    window.removeEventListener(WAKE_EVENT, woke);
    unmount();
});

it("only marks data stale when the window is hidden in the tray (a refetch would wake the database)", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const woke = vi.fn();
    window.addEventListener(WAKE_EVENT, woke);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { unmount } = renderHook(() => useWakeRefresh(), { wrapper });

    vi.setSystemTime(Date.now() + 10 * 60_000);
    vi.advanceTimersByTime(30_000);
    expect(refetch).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ type: "active", refetchType: "none" });
    expect(woke).toHaveBeenCalledOnce();

    window.removeEventListener(WAKE_EVENT, woke);
    unmount();
});
