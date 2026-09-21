import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileHeaderActions, MobileTabBar } from "../../../app/components/layout/MobileNavigation";
import { SignOutButton } from "../../../app/components/settings/SignOutButton";
import { NotificationCenter } from "../../../app/components/notifications/NotificationCenter";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";

const state = vi.hoisted(() => ({ signOut: vi.fn(), error: vi.fn() }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({
    session: { user: { name: "Sam", email: "sam@example.com" } }, completeSignOut: state.signOut,
}) }));
vi.mock("../../../app/hooks/notifications/use-notification-center", () => ({ useNotificationCenter: () => ({ hasUnread: true }) }));
vi.mock("sonner", () => ({ toast: { error: state.error } }));

function Location() { const location = useLocation(); return <output aria-label="Current location">{location.pathname}{location.search}</output>; }
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => vi.unstubAllGlobals());

describe("Compact navigation", () => {
    it.each(["/", "/today", "/schedule", "/routines", "/browse", "/project/example", "/?settings=appearance", "/today?notifications=true"])("keeps four destinations and one selected tab at %s", (path) => {
        render(<MemoryRouter initialEntries={[path]}><TooltipProvider><MobileTabBar /></TooltipProvider></MemoryRouter>);
        const links = within(screen.getByRole("navigation", { name: "Primary navigation" })).getAllByRole("link");
        expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["Capture", "Schedule", "Routines", "Browse"]);
        expect(links.filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
    });

    it("shows search only in Browse and opens the assistant from the center action", () => {
        const onSearch = vi.fn();
        render(<MemoryRouter initialEntries={["/browse"]}><TooltipProvider><MobileTabBar /><MobileHeaderActions onSearch={onSearch} /></TooltipProvider></MemoryRouter>);
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(onSearch).toHaveBeenCalledOnce();
        const assistant = screen.getByRole("button", { name: "Ask assistant" });
        expect(assistant.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(assistant);
        expect(assistant.getAttribute("aria-expanded")).toBe("true");
    });

    it("opens utility sheets on the current page without exposing profile separately", () => {
        render(<MemoryRouter initialEntries={["/today?tag=work"]}><TooltipProvider><Location /><MobileHeaderActions onSearch={vi.fn()} /></TooltipProvider></MemoryRouter>);
        expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Notifications, unread activity" }));
        expect(screen.getByRole("status", { name: "Current location" }).textContent).toBe("/today?tag=work&notifications=true");
    });

    it("uses the existing sign-out cleanup and recovers from an error", async () => {
        state.signOut.mockRejectedValueOnce(new Error("Offline"));
        render(<SignOutButton />);
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect((screen.getByRole("button", { name: "Signing out…" }) as HTMLButtonElement).disabled).toBe(true);
        await waitFor(() => expect(state.error).toHaveBeenCalledWith("Offline"));
        expect(state.signOut).toHaveBeenCalledTimes(1);
        await waitFor(() => expect((screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement).disabled).toBe(false));
        state.signOut.mockResolvedValueOnce(undefined);
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        await waitFor(() => expect((screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement).disabled).toBe(false));
        expect(state.signOut).toHaveBeenCalledTimes(2);
    });

    it("notification dismiss keyboard events do not open the associated task", async () => {
        const markRead = vi.fn(); const dismiss = vi.fn(); const markAllRead = vi.fn(); const defer = vi.fn();
        render(<MemoryRouter><TooltipProvider><Location /><NotificationCenter fullPage hasUnread markRead={markRead} markUnread={vi.fn()} markAllRead={markAllRead} dismiss={dismiss} defer={defer} onClose={vi.fn()}
            grouped={[{ group: "today", label: "Today", items: [{ id: "notice", kind: "task-due", title: "Review plan", body: "Due today", triggerAt: new Date().toISOString(), entityId: "task1", route: "/today", priority: "normal", read: false }] }]} /></TooltipProvider></MemoryRouter>);
        const button = screen.getByRole("button", { name: "Dismiss notification: Review plan" });
        fireEvent.keyDown(button, { key: "Enter" });
        fireEvent.click(button);
        expect(dismiss).toHaveBeenCalledWith("notice");
        fireEvent.keyDown(screen.getByRole("button", { name: "Defer notification: Review plan" }), { key: "Enter" });
        fireEvent.click(screen.getByRole("menuitem", { name: "10 minutes" }));
        await waitFor(() => expect(defer).toHaveBeenCalledWith("notice", "10_minutes"));
        fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
        expect(markAllRead).toHaveBeenCalledTimes(1);
        expect(markRead).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Review plan. Due today. Unread" }));
        expect(markRead).toHaveBeenCalledWith("notice");
        expect(screen.getByRole("status", { name: "Current location" }).textContent).toContain("/today?focusKind=task&focusId=task1");
    });
});
