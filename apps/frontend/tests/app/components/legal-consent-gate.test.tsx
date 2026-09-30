import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSION } from "@cadence/contracts/settings";
import { LegalConsentGate } from "../../../app/components/legal/LegalConsentGate";
import { rememberSignUpTicks } from "../../../app/lib/legal-consent";

const state = vi.hoisted(() => ({
    settings: { privacy: { legalVersion: null as string | null } },
    dataUpdatedAt: 1,
    mutateAsync: vi.fn(),
    completeSignOut: vi.fn(),
}));

vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: state.settings, dataUpdatedAt: state.dataUpdatedAt }),
    useUpdateSettings: () => ({ mutateAsync: state.mutateAsync }),
}));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ completeSignOut: state.completeSignOut }) }));
vi.mock("../../../app/lib/utils/error-toast", () => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("LegalConsentGate", () => {
    beforeEach(() => {
        localStorage.clear();
        state.settings = { privacy: { legalVersion: null } };
        state.dataUpdatedAt = 1;
        state.mutateAsync.mockReset().mockResolvedValue(undefined);
    });

    it("blocks an account that never accepted until the box is ticked, then records it", () => {
        render(<LegalConsentGate />);
        const cont = screen.getByRole("button", { name: "Continue" });
        expect(cont.hasAttribute("disabled")).toBe(true);
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(cont);
        expect(state.mutateAsync).toHaveBeenCalledWith({ privacy: { legalAcceptedAt: expect.any(String), legalVersion: LEGAL_VERSION } });
    });

    it("stays away once the current version is accepted, and while only the device's cached copy is showing", () => {
        state.settings = { privacy: { legalVersion: LEGAL_VERSION } };
        const { unmount } = render(<LegalConsentGate />);
        expect(screen.queryByRole("checkbox")).toBeNull();
        unmount();

        state.settings = { privacy: { legalVersion: null } };
        state.dataUpdatedAt = 0;
        render(<LegalConsentGate />);
        expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("records the sign-up ticks quietly instead of asking a second time", () => {
        rememberSignUpTicks(true);
        render(<LegalConsentGate />);
        expect(state.mutateAsync).toHaveBeenCalledTimes(1);
    });
});
