import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InboxItem } from "@cadence/contracts/inbox";
import { InboxItemCard } from "../../../app/components/inbox/InboxItemCard";

const mocks = vi.hoisted(() => ({ process: vi.fn(), update: vi.fn() }));
vi.mock("../../../app/hooks/inbox/use-update-inbox-item", () => ({ useUpdateInboxItem: () => ({ mutate: mocks.update, isPending: false }) }));
vi.mock("../../../app/hooks/inbox/use-process-inbox-to-task", () => ({
    useProcessInboxToTask: () => ({ mutate: mocks.process, isPending: false }),
    todayISO: () => "2026-09-16", tomorrowISO: () => "2026-09-17",
}));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: null }) }));
vi.mock("../../../app/lib/api/track-event", () => ({ trackUsageEvent: vi.fn() }));
const item: InboxItem = {
    id: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222",
    rawText: "Review notes", createdAt: "2026-09-16T12:00:00Z", sectionId: null,
    orderIndex: 0, processed: false, captureKind: "task", captureStatus: "clarifying", placedTaskId: null,
    aiSuggestion: null, analysis: null, analysisStatus: null, analysisVersion: null, analysisSummary: null, sourceSurface: null,
};
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

it("uses the menu's Enter action without also running the focused card shortcut", async () => {
    const clarify = vi.fn();
    render(<InboxItemCard item={item} isFocused onClarify={clarify} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "More actions" }), { key: "Enter" });
    const tomorrow = await screen.findByRole("menuitem", { name: /^Tomorrow/ });
    fireEvent.keyDown(tomorrow, { key: "Enter" });
    expect(mocks.process).toHaveBeenCalledOnce();
    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({ inboxItemId: item.id, scheduledDate: "2026-09-17" }));
    expect(clarify).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
});

it("closes with Escape and returns focus to the overflow trigger", async () => {
    render(<InboxItemCard item={item} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("menuitem", { name: /^Tomorrow/ }), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
});
