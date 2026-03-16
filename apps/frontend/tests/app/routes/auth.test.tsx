import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import AuthPage from "../../../app/routes/auth";

const authViewMock = vi.fn(
    ({ view }: { view: "SIGN_IN" | "SIGN_UP" }) => (
        <div data-testid="auth-view" data-view={view}>
            <button type="button">
                <svg aria-hidden="true" />
            </button>
            <button type="button">
                <svg aria-hidden="true" />
            </button>
            <button type="button">
                <svg aria-hidden="true" />
            </button>
        </div>
    ),
);

vi.mock("@neondatabase/auth/react/ui", () => ({
    AuthView: (props: { view: "SIGN_IN" | "SIGN_UP" }) => authViewMock(props),
    AuthCallback: () => <div>Auth callback</div>,
}));

vi.mock("../../../app/hooks/core/use-document-meta", () => ({
    useDocumentMeta: vi.fn(),
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({
        beginAuthRecovery: vi.fn(),
        authReady: true,
        session: null,
    }),
}));

vi.mock("../../../app/lib/auth-client", () => ({
    authClient: {
        signIn: {
            social: vi.fn(),
        },
        getSession: vi.fn(),
    },
}));

vi.mock("../../../app/platform/runtime", () => ({
    DESKTOP_AUTH_BRIDGE_PARAM: "desktop",
    DESKTOP_AUTH_PROVIDER_PARAM: "provider",
    getAuthCallbackUrl: (redirectTo: string) => `/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
    getDesktopAuthBrowserCallbackPath: (redirectTo: string) => `/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
    getDesktopDeepLinkCallbackUrl: () => "cadence://auth/callback",
    IS_DESKTOP_RUNTIME: false,
    normalizeRedirectTo: (value: string | null | undefined) => value ?? "/",
}));

function renderAuthPage(initialEntry: string) {
    const result = render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/auth/sign-in" element={<AuthPage />} />
                <Route path="/auth/sign-up" element={<AuthPage />} />
                <Route path="/auth/callback" element={<AuthPage />} />
                <Route path="/auth/desktop-start" element={<AuthPage />} />
            </Routes>
        </MemoryRouter>,
    );

    return {
        ...result,
        layoutSection: result.container.querySelector("section"),
    };
}

describe("auth route", () => {
    it("renders the centered sanctuary sign-in surface and labels icon-only auth buttons", async () => {
        const { layoutSection } = renderAuthPage("/auth/sign-in");

        expect(screen.getByText("Step into your Cadence.")).toBeTruthy();
        expect(screen.getByRole("img", { name: "Cadence" }).getAttribute("src")).toBe("/logo.png");
        expect(layoutSection?.className).toContain("md:items-center");

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
            expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeTruthy();
            expect(screen.getByRole("button", { name: "Toggle password visibility" })).toBeTruthy();
        });
    });

    it("swaps to the sign-up editorial heading without reintroducing marketing split copy", () => {
        renderAuthPage("/auth/sign-up");

        expect(screen.getByText("Create your sanctuary.")).toBeTruthy();
        expect(screen.queryByText("A quiet space for your brightest thoughts")).toBeNull();
    });
});
