import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { OfflineBanner } from "../../../app/components/shared/OfflineBanner";
import { withClient } from "../../helpers";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";

const mocks = vi.hoisted(() => ({
    retryAndReplay: vi.fn().mockResolvedValue(undefined),
    removeWalEntry: vi.fn().mockResolvedValue(undefined),
}));
let walSnapshot: Array<{ id: string; op: { type: string; id: string }; status: string; error?: string; createdAt: number }> = [];
const entry = (status: string, id = "1") => ({ id, op: { type: "delete_task", id: `task-${id}` }, status, error: "It may have been deleted.", createdAt: Date.now() });

vi.mock("../../../app/lib/api/offline-wal", () => ({
    subscribeWal: () => () => {},
    getWalSnapshot: () => walSnapshot,
    getWalServerSnapshot: () => [],
    removeWalEntry: mocks.removeWalEntry,
    updateWalEntry: vi.fn(),
    walTargetIds: (op: { id: string }) => [op.id],
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ authReady: true, isAuthenticated: true, session: null }) }));
vi.mock("../../../app/lib/api/mutation-executor", () => ({ retryAndReplay: mocks.retryAndReplay, replayWal: vi.fn() }));

const Client = withClient();
const renderBanner = () => render(<OfflineBanner />, {
    wrapper: ({ children }) => <Client><TooltipProvider>{children}</TooltipProvider></Client>,
});

describe("OfflineBanner", () => {
    beforeEach(() => {
        walSnapshot = [];
        vi.clearAllMocks();
        Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    });

    it("renders nothing when online with no pending mutations", () => {
        const { container } = renderBanner();
        expect(container.querySelector(".offline-banner")).toBeNull();
    });

    it("shows offline state when navigator.onLine is false", () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        renderBanner();
        expect(screen.getByText(/you're offline/i)).toBeTruthy();
    });

    it("says how many changes will sync when offline", () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        walSnapshot = [entry("pending", "1"), entry("pending", "2")];
        renderBanner();
        expect(screen.getByText(/2 changes will sync/i)).toBeTruthy();
    });

    it("reviews failed changes one by one, and retries all from there", async () => {
        walSnapshot = [entry("failed")];
        renderBanner();
        expect(screen.getByText(/1 change didn't sync/i)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Review" }));
        expect(await screen.findByText("Delete a task")).toBeTruthy();
        expect(screen.getByText("It may have been deleted.")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Retry all" }));
        expect(mocks.retryAndReplay).toHaveBeenCalledTimes(1);
        expect(mocks.retryAndReplay.mock.calls[0][0]).toBeInstanceOf(QueryClient);
    });

    it("discards a failed change only after a second tap", async () => {
        walSnapshot = [entry("failed")];
        renderBanner();
        fireEvent.click(screen.getByRole("button", { name: "Review" }));

        fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
        expect(mocks.removeWalEntry).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Discard for good" }));
        expect(mocks.removeWalEntry).toHaveBeenCalledWith("1");
    });

    it("shows syncing state when replaying", () => {
        walSnapshot = [entry("replaying")];
        renderBanner();
        expect(screen.getByText(/syncing 1 change…/i)).toBeTruthy();
    });
});
