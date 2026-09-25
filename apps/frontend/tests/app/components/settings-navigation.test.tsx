import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SettingsSheet } from "../../../app/components/settings/SettingsSheet";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { Location } from "../../helpers";

vi.mock("../../../app/components/shared/ResponsiveOverlayPanel", () => ({ ResponsiveOverlayPanel: ({ children, open, ariaLabel }: { children: ReactNode; open: boolean; ariaLabel: string }) => open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ session: { user: { name: "Sam" } } }) }));
vi.mock("../../../app/components/settings/SignOutButton", () => ({ SignOutButton: () => <button>Sign out</button> }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ flushAllPendingSettingsMutations: vi.fn() }));
vi.mock("../../../app/components/settings/tabs/AccountTab", () => ({ AccountTab: () => <p>Account controls</p> }));
vi.mock("../../../app/components/settings/tabs/AppearanceTab", () => ({ AppearanceTab: () => <p>Appearance controls</p> }));
vi.mock("../../../app/components/settings/tabs/NotificationsTab", () => ({ NotificationsTab: () => <p>Notification controls</p> }));
vi.mock("../../../app/components/settings/tabs/DateTimeTab", () => ({ DateTimeTab: () => null }));
vi.mock("../../../app/components/settings/tabs/AITab", () => ({ AITab: () => null }));
vi.mock("../../../app/components/settings/tabs/AssistantTab", () => ({ AssistantTab: () => null }));
vi.mock("../../../app/components/settings/tabs/ShortcutsTab", () => ({ ShortcutsTab: () => null }));
vi.mock("../../../app/components/settings/tabs/TasksTab", () => ({ TasksTab: () => null }));
vi.mock("../../../app/components/settings/tabs/IntegrationsTab", () => ({ IntegrationsTab: () => null }));
vi.mock("../../../app/components/settings/tabs/LocationTab", () => ({ LocationTab: () => null }));
vi.mock("../../../app/components/settings/tabs/DataPrivacyTab", () => ({ DataPrivacyTab: () => null }));
vi.mock("../../../app/components/settings/tabs/AboutTab", () => ({ AboutTab: () => null }));

function setup(tab = "menu") {
    render(<MemoryRouter initialEntries={["/today?tag=work", { pathname: "/today", search: `?tag=work&settings=${tab}`, state: { utilitySheet: true } }]} initialIndex={1}>
        <TooltipProvider><Location /><SettingsSheet /></TooltipProvider>
    </MemoryRouter>);
}
describe("Settings sheet hierarchy", () => {
    it("contains profile, every category, and sign-out in a single settings sheet", () => {
        setup();
        expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Profile & Security/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Appearance" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("/today?tag=work&settings=menu");
    });
    it("drills into a category and back inside the same sheet", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
        expect(screen.getByRole("dialog", { name: "Appearance" })).toBeTruthy();
        expect(screen.getByText("Appearance controls")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
        expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("/today?tag=work&settings=menu");
    });
    it("dismisses the whole sheet to its origin without leaving detail entries in history", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: /Profile & Security/ }));
        expect(screen.getByText("Account controls")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Close Profile & Security" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole("status").textContent).toBe("/today?tag=work");
    });
    it("recovers an unknown category to the settings menu", () => {
        setup("unknown");
        expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Appearance" })).toBeTruthy();
    });
});
