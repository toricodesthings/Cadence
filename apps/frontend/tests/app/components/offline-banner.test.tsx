import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { OfflineBanner } from "../../../app/components/shared/OfflineBanner";
import { withClient } from "../../helpers";

const mocks = vi.hoisted(() => ({ retryAndReplay: vi.fn().mockResolvedValue(undefined), clearFailedEntries: vi.fn() }));
let walSnapshot: Array<{ id: string; op: { type: string }; status: string; createdAt: number }> = [];
const entry = (status: string, id = "1") => ({ id, op: { type: "delete_task" }, status, createdAt: Date.now() });

vi.mock("../../../app/lib/api/offline-wal", () => ({
    subscribeWal: () => () => {},
    getWalSnapshot: () => walSnapshot,
    getWalServerSnapshot: () => [],
    clearFailedEntries: mocks.clearFailedEntries,
}));

vi.mock("../../../app/lib/api/mutation-executor", () => ({ retryAndReplay: mocks.retryAndReplay }));

const renderBanner = () => render(<OfflineBanner />, { wrapper: withClient() });

describe("OfflineBanner", () => {
    beforeEach(() => {
        walSnapshot = [];
        vi.clearAllMocks();
        Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    });

    it("renders nothing when online with no pending mutations", () => {
        const { container } = renderBanner();
        expect(container.firstChild).toBeNull();
    });

    it("shows offline state when navigator.onLine is false", () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        renderBanner();
        expect(screen.getByText(/you're offline/i)).toBeTruthy();
    });

    it("shows queued count when offline with pending mutations", () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        walSnapshot = [entry("pending", "1"), entry("pending", "2")];
        renderBanner();
        expect(screen.getByText(/2 changes queued/i)).toBeTruthy();
    });

    it("shows failed state with retry and dismiss buttons", () => {
        walSnapshot = [entry("failed")];
        renderBanner();
        expect(screen.getByText(/1 change failed to sync/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /dismiss/i })).toBeTruthy();
    });

    it("retry button invokes retryAndReplay to immediately replay", () => {
        walSnapshot = [entry("failed")];
        renderBanner();

        fireEvent.click(screen.getByRole("button", { name: /retry/i }));

        expect(mocks.retryAndReplay).toHaveBeenCalledTimes(1);
        expect(mocks.retryAndReplay.mock.calls[0][0]).toBeInstanceOf(QueryClient);
    });

    it("dismiss button clears failed entries", () => {
        walSnapshot = [entry("failed")];
        renderBanner();

        fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

        expect(mocks.clearFailedEntries).toHaveBeenCalledTimes(1);
    });

    it("shows syncing state when replaying", () => {
        walSnapshot = [entry("replaying")];
        renderBanner();
        expect(screen.getByText(/syncing 1 pending changes/i)).toBeTruthy();
    });
});
