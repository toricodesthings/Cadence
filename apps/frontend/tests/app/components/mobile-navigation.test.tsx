import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileHeaderActions, MobileTabBar } from "../../../app/components/layout/MobileNavigation";
import { SignOutButton } from "../../../app/components/settings/SignOutButton";
import { NotificationCenter } from "../../../app/components/notifications/NotificationCenter";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { Location } from "../../helpers";

vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { appearance: { motion: "reduced" } } }) }));
vi.mock("../../../app/hooks/habits/use-routine-due-count", () => ({ useRoutineDueCount: () => 0 }));

const state = vi.hoisted(() => ({ signOut: vi.fn(), error: vi.fn(), forgetDevice: vi.fn() }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({
    session: { user: { name: "Sam", email: "sam@example.com" } }, completeSignOut: state.signOut,
}) }));
vi.mock("../../../app/hooks/notifications/use-notification-center", () => ({ useNotificationCenter: () => ({ hasUnread: true, unreadCount: 5 }) }));
vi.mock("sonner", () => ({ toast: { error: state.error } }));
// Sign-out forgets this device on the server first; a real call here reaches the network (and timed out on CI).
vi.mock("../../../app/lib/notifications/device-delivery", () => ({ forgetThisDevice: state.forgetDevice }));

beforeEach(() => {
    vi.clearAllMocks();
    state.forgetDevice.mockResolvedValue(undefined);
});

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
        fireEvent.click(screen.getByRole("button", { name: "Notifications, 5 unread" }));
        expect(screen.getByRole("status", { name: "Current location" }).textContent).toBe("/today?tag=work&notifications=true");
    });

    describe("dock lens", () => {
        // Five slots, 60px each: Capture, Schedule, orb, Routines, Browse.
        const slot = (el: Element, i: number) => Object.assign(el, { getBoundingClientRect: () => ({ left: i * 60, width: 60, right: i * 60 + 60, top: 0, bottom: 44, height: 44 }) });
        function renderDock(path = "/") {
            render(<MemoryRouter initialEntries={[path]}><TooltipProvider><Location /><MobileTabBar /></TooltipProvider></MemoryRouter>);
            const nav = screen.getByRole("navigation", { name: "Primary navigation" });
            const track = nav.firstElementChild!;
            slot(track, 0);
            Object.assign(track, { getBoundingClientRect: () => ({ left: 0, width: 300, right: 300, top: 0, bottom: 44, height: 44 }) });
            const links = within(nav).getAllByRole("link");
            links.forEach((link, i) => slot(link, i < 2 ? i : i + 1));
            slot(track.querySelector("[data-lens-exclude]")!, 2);
            return { links, location: () => screen.getByRole("status", { name: "Current location" }).textContent };
        }
        const touch = (type: "pointerDown" | "pointerMove" | "pointerUp", el: Element, clientX: number) =>
            fireEvent[type](el, { pointerType: "touch", pointerId: 1, isPrimary: true, clientX });

        it("a tap on Schedule navigates", () => {
            const { links, location } = renderDock();
            fireEvent.click(links[1]);
            expect(location()).toBe("/schedule");
        });

        it("scrubbing from Capture to Routines goes to Routines once", () => {
            const { links, location } = renderDock();
            touch("pointerDown", links[0], 30);
            touch("pointerMove", links[0], 120);
            touch("pointerMove", links[0], 210);
            touch("pointerUp", links[0], 210);
            fireEvent.click(links[0]);
            expect(location()).toBe("/routines");
        });

        it("letting go over the assistant cancels", () => {
            const { links, location } = renderDock();
            const assistant = screen.getByRole("button", { name: /Ask assistant/ });
            const expanded = assistant.getAttribute("aria-expanded");
            touch("pointerDown", links[0], 30);
            touch("pointerMove", links[0], 150);
            touch("pointerUp", links[0], 150);
            expect(location()).toBe("/");
            expect(assistant.getAttribute("aria-expanded")).toBe(expanded);
        });

        it("a mouse click still navigates", () => {
            const { links, location } = renderDock();
            fireEvent.pointerDown(links[3], { pointerType: "mouse", clientX: 270 });
            fireEvent.click(links[3]);
            expect(location()).toBe("/browse");
        });
    });

    it("uses the existing sign-out cleanup and recovers from an error", async () => {
        state.signOut.mockRejectedValueOnce(new Error("Offline"));
        render(<SignOutButton />);
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect((screen.getByRole("button", { name: "Signing out…" }) as HTMLButtonElement).disabled).toBe(true);
        await waitFor(() => expect(state.error).toHaveBeenCalledWith("Offline"));
        expect(state.signOut).toHaveBeenCalledTimes(1);
        expect(state.forgetDevice).toHaveBeenCalledTimes(1);
        await waitFor(() => expect((screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement).disabled).toBe(false));
        state.signOut.mockResolvedValueOnce(undefined);
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        await waitFor(() => expect((screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement).disabled).toBe(false));
        expect(state.signOut).toHaveBeenCalledTimes(2);
    });

    it("notification dismiss keyboard events do not open the associated task", async () => {
        const markRead = vi.fn(); const dismiss = vi.fn(); const markAllRead = vi.fn(); const defer = vi.fn();
        render(<MemoryRouter><TooltipProvider><Location /><NotificationCenter fullPage hasUnread markRead={markRead} markUnread={vi.fn()} markAllRead={markAllRead} dismiss={dismiss} defer={defer} onClose={vi.fn()}
            grouped={[{ group: "today", label: "Today", items: [{ id: "notice", kind: "task-due", title: "Review plan", body: "Due today", triggerAt: new Date().toISOString(), alertAt: null, entityId: "task1", route: "/today", priority: "normal", read: false }] }]} /></TooltipProvider></MemoryRouter>);
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
