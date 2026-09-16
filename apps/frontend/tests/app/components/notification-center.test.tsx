import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "../../../app/components/notifications/NotificationCenter";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import type { AppNotification } from "../../../app/lib/notifications/notification-model";

const notices: AppNotification[] = [
    { id: "old", title: "Old priority task", body: "Due today", kind: "task-due", priority: "high", read: false, triggerAt: "2026-09-16T08:00:00Z", route: "/today", entityId: "task1" },
    { id: "new", title: "New reminder", body: "Review the launch", kind: "task-reminder", priority: "normal", read: false, triggerAt: "2026-09-16T10:00:00Z", route: "/today", entityId: "task2" },
    { id: "bundle", title: "Missed routines", body: "3 habits are waiting for you", kind: "habit-reminder", priority: "normal", read: true, triggerAt: "2026-09-16T09:00:00Z", route: "/habits", entityId: null },
];

function Location() {
    const location = useLocation();
    const navigate = useNavigate();
    return <><output aria-label="Current location">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Back</button></>;
}
function setup(items = notices) {
    const cleared = vi.fn();
    function Harness() {
        const [notifications, setNotifications] = useState(items);
        return <NotificationCenter fullPage grouped={[{ group: "today", label: "Today", items: notifications }]}
            hasUnread={notifications.some((n) => !n.read)} onClose={vi.fn()}
            markRead={(id) => setNotifications((all) => all.map((n) => n.id === id ? { ...n, read: true } : n))}
            markUnread={(id) => setNotifications((all) => all.map((n) => n.id === id ? { ...n, read: false } : n))}
            markAllRead={() => setNotifications((all) => all.map((n) => ({ ...n, read: true })))}
            dismiss={(id) => setNotifications((all) => all.filter((n) => n.id !== id))}
            dismissMany={(ids) => { cleared(ids); setNotifications((all) => all.filter((n) => !ids.includes(n.id))); }}
            defer={(id) => setNotifications((all) => all.filter((n) => n.id !== id))} />;
    }
    render(<MemoryRouter initialEntries={["/today?tag=work", "/today?tag=work&notifications=true"]} initialIndex={1}><TooltipProvider><Location /><Harness /></TooltipProvider></MemoryRouter>);
    return { cleared };
}
function rowTitles() {
    return screen.getAllByRole("listitem").map((row) => within(row).getAllByRole("button")[0].getAttribute("aria-label")?.split(".")[0]);
}

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
function openMenu(name: string | RegExp) {
    fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });
}

describe("Expanded notification center", () => {
    it("sorts globally, combines unread and search filters, and recovers from no results", () => {
        setup();
        expect(rowTitles()).toEqual(["New reminder", "Missed routines", "Old priority task"]);
        openMenu(/^Sort notifications/);
        fireEvent.click(screen.getByRole("menuitemradio", { name: "Oldest first" }));
        expect(rowTitles()).toEqual(["Old priority task", "Missed routines", "New reminder"]);
        openMenu(/^Sort notifications/);
        fireEvent.click(screen.getByRole("menuitemradio", { name: "Priority first" }));
        expect(rowTitles()).toEqual(["Old priority task", "New reminder", "Missed routines"]);
        fireEvent.click(screen.getByRole("button", { name: /^Unread/ }));
        expect(rowTitles()).toEqual(["Old priority task", "New reminder"]);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  LAUNCH  " } });
        expect(rowTitles()).toEqual(["New reminder"]);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no match" } });
        expect(screen.getByText("No matching notifications")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Show all notifications" }));
        expect(rowTitles()).toHaveLength(3);
    });

    it("marks individual and all notifications read without navigation and preserves focus", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /^Unread/ }));
        const read = screen.getByRole("button", { name: "Mark as read: New reminder" });
        read.focus();
        fireEvent.click(read);
        expect(rowTitles()).toEqual(["Old priority task"]);
        expect(document.activeElement?.getAttribute("aria-label")).toBe("Old priority task. Due today. Unread");
        fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
        expect(screen.getByText("You’re all caught up")).toBeTruthy();
        expect(screen.getByRole("status", { name: "Current location" }).textContent).toContain("notifications=true");
    });

    it("shows read state, marks a read notification unread, and keeps it in the unread filter", () => {
        setup();
        expect(screen.queryByText("3 notifications")).toBeNull();
        const readMark = screen.getByRole("button", { name: "Mark as unread: Missed routines" });
        expect(readMark.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(readMark);
        expect(screen.getByRole("button", { name: "Mark as read: Missed routines" }).getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(screen.getByRole("button", { name: /^Unread/ }));
        expect(rowTitles()).toContain("Missed routines");
        expect(screen.getByRole("status", { name: "Current location" }).textContent).toContain("notifications=true");
    });

    it("requires confirmation to clear the entire list, including filtered-out items", () => {
        const { cleared } = setup();
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "launch" } });
        fireEvent.click(screen.getByRole("button", { name: "Clear all…" }));
        expect(screen.getByRole("alertdialog").textContent).toContain("Clear 3 notifications?");
        expect(cleared).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Keep notifications" }));
        expect(cleared).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Clear all…" }));
        fireEvent.click(screen.getByRole("button", { name: "Clear notifications" }));
        expect(cleared).toHaveBeenCalledWith(["old", "new", "bundle"]);
        expect(screen.queryByRole("listitem")).toBeNull();
    });

    it("opens bundled habits and replaces the utility history entry", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Missed routines. 3 habits are waiting for you" }));
        expect(screen.getByRole("status", { name: "Current location" }).textContent).toBe("/habits");
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByRole("status", { name: "Current location" }).textContent).toBe("/today?tag=work");
    });

    it("defers without opening a task and moves focus to the next reminder", async () => {
        setup();
        openMenu("Defer notification: New reminder");
        fireEvent.click(screen.getByRole("menuitem", { name: "10 minutes" }));
        await waitFor(() => expect(rowTitles()).toEqual(["Missed routines", "Old priority task"]));
        expect(document.activeElement?.getAttribute("aria-label")).toContain("Missed routines");
        expect(screen.getByRole("status", { name: "Current location" }).textContent).toContain("notifications=true");
    });

    it("bounds large lists while searching all notifications, and labels future reminders", () => {
        setup(Array.from({ length: 75 }, (_, i) => ({ ...notices[0], id: `n${i}`, title: `Reminder ${i}`, triggerAt: "2099-09-16T10:00:00Z" })));
        expect(screen.getAllByRole("listitem")).toHaveLength(30);
        expect(within(screen.getAllByRole("listitem")[0]).getByText(/^In /)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Show more · 45 remaining" }));
        expect(screen.getAllByRole("listitem")).toHaveLength(60);
        expect(document.activeElement).toBe(within(screen.getAllByRole("listitem")[30]).getAllByRole("button")[0]);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Reminder 74" } });
        expect(rowTitles()).toEqual(["Reminder 74"]);
    });
});
