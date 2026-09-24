import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreview } from "../../../app/components/notifications/NotificationPreview";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";

const state = vi.hoisted(() => ({ markRead: vi.fn(), dismiss: vi.fn() }));
vi.mock("../../../app/hooks/notifications/use-notification-center", () => ({ useNotificationCenter: () => ({
    notifications: Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, title: `Reminder ${i}`, body: "Due today", kind: "task-due", priority: i === 0 ? "high" : "normal", read: false, triggerAt: `2026-09-16T0${i}:00:00Z`, route: "/today", entityId: `task${i}` })),
    hasUnread: true, unreadCount: 5, markRead: state.markRead, dismiss: state.dismiss,
}) }));
function Location() { const location = useLocation(); return <output aria-label="Current route">{location.pathname}{location.search}</output>; }
function setup() {
    render(<MemoryRouter initialEntries={["/today?tag=work"]}><TooltipProvider><Location /><NotificationPreview /></TooltipProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 5 unread" }));
}
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
describe("Desktop notification preview", () => {
    it("shows only the three newest reminders and expands on request", () => {
        setup();
        expect(screen.getAllByRole("listitem").map((row) => within(row).getAllByRole("button")[0].textContent)).toEqual([
            expect.stringContaining("Reminder 4"), expect.stringContaining("Reminder 3"), expect.stringContaining("Reminder 2"),
        ]);
        expect(screen.queryByRole("searchbox")).toBeNull();
        expect(screen.getByRole("status", { name: "Current route" }).textContent).toBe("/today?tag=work");
        fireEvent.click(screen.getByRole("button", { name: "View all 5 notifications" }));
        expect(screen.getByRole("status", { name: "Current route" }).textContent).toBe("/today?tag=work&notifications=true");
        expect(state.markRead).not.toHaveBeenCalled();
    });
    it("dismisses independently and opens a reminder directly", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Dismiss notification: Reminder 4" }));
        expect(state.dismiss).toHaveBeenCalledWith("n4");
        expect(state.markRead).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Reminder 3. Due today. Unread" }));
        expect(state.markRead).toHaveBeenCalledWith("n3");
        expect(screen.getByRole("status", { name: "Current route" }).textContent).toContain("focusId=task3");
    });
});
