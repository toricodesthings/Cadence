import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineBanner } from "../../../app/components/shared/OfflineBanner";

const retryAndReplayMock = vi.fn().mockResolvedValue(undefined);
const clearFailedEntriesMock = vi.fn();

vi.mock("../../../app/lib/api/offline-wal", () => ({
    subscribeWal: (cb: () => void) => {
        return () => {};
    },
    getWalSnapshot: () => walSnapshot,
    getWalServerSnapshot: () => [],
    clearFailedEntries: (...args: unknown[]) => clearFailedEntriesMock(...args),
}));

vi.mock("../../../app/lib/api/mutation-executor", () => ({
    retryAndReplay: (...args: unknown[]) => retryAndReplayMock(...args),
}));

let walSnapshot: Array<{ id: string; op: { type: string }; status: string; createdAt: number }> = [];

function setWalSnapshot(entries: typeof walSnapshot) {
    walSnapshot = entries;
}

function renderBanner() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <OfflineBanner />
        </QueryClientProvider>,
    );
}

describe("OfflineBanner", () => {
    beforeEach(() => {
        walSnapshot = [];
        retryAndReplayMock.mockClear();
        clearFailedEntriesMock.mockClear();
        Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    });

    it("renders nothing when online with no pending mutations", () => {
        setWalSnapshot([]);
        const { container } = renderBanner();
        expect(container.firstChild).toBeNull();
    });

    it("shows offline state when navigator.onLine is false", () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        setWalSnapshot([]);
        renderBanner();
        expect(screen.getByText(/you're offline/i)).toBeTruthy();
    });

    it("shows queued count when offline with pending mutations", () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        setWalSnapshot([
            { id: "1", op: { type: "delete_task" }, status: "pending", createdAt: Date.now() },
            { id: "2", op: { type: "delete_task" }, status: "pending", createdAt: Date.now() },
        ]);
        renderBanner();
        expect(screen.getByText(/2 changes queued/i)).toBeTruthy();
    });

    it("shows failed state with retry and dismiss buttons", () => {
        setWalSnapshot([
            { id: "1", op: { type: "delete_task" }, status: "failed", createdAt: Date.now() },
        ]);
        renderBanner();
        expect(screen.getByText(/1 change failed to sync/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /dismiss/i })).toBeTruthy();
    });

    it("retry button invokes retryAndReplay to immediately replay", () => {
        setWalSnapshot([
            { id: "1", op: { type: "delete_task" }, status: "failed", createdAt: Date.now() },
        ]);
        renderBanner();

        fireEvent.click(screen.getByRole("button", { name: /retry/i }));

        expect(retryAndReplayMock).toHaveBeenCalledTimes(1);
        // Verify it receives a QueryClient instance
        expect(retryAndReplayMock.mock.calls[0][0]).toBeInstanceOf(QueryClient);
    });

    it("dismiss button clears failed entries", () => {
        setWalSnapshot([
            { id: "1", op: { type: "delete_task" }, status: "failed", createdAt: Date.now() },
        ]);
        renderBanner();

        fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

        expect(clearFailedEntriesMock).toHaveBeenCalledTimes(1);
    });

    it("shows syncing state when replaying", () => {
        setWalSnapshot([
            { id: "1", op: { type: "delete_task" }, status: "replaying", createdAt: Date.now() },
        ]);
        renderBanner();
        expect(screen.getByText(/syncing 1 pending changes/i)).toBeTruthy();
    });
});
