import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "../../../app/routes/auth";

const authState = vi.hoisted(() => ({
    beginAuthRecovery: vi.fn(),
    authReady: true,
    isAuthenticated: false,
    session: null,
}));

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
    useAuthState: () => authState,
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
    const tree = () => (
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/auth/sign-in" element={<AuthPage />} />
                <Route path="/auth/sign-up" element={<AuthPage />} />
                <Route path="/auth/callback" element={<AuthPage />} />
                <Route path="/auth/desktop-start" element={<AuthPage />} />
                <Route path="/today" element={<div>Workspace</div>} />
            </Routes>
        </MemoryRouter>
    );
    const result = render(tree());

    return {
        ...result,
        publishAuthState: () => result.rerender(tree()),
        layoutSection: result.container.querySelector("section"),
    };
}

describe("auth route", () => {
    beforeEach(() => {
        authState.beginAuthRecovery.mockReset().mockResolvedValue(false);
        authState.authReady = true;
        authState.isAuthenticated = false;
    });
    afterEach(() => vi.useRealTimers());

    it("retries an empty callback session and enters the requested route after recovery", async () => {
        vi.useFakeTimers();
        authState.beginAuthRecovery.mockImplementationOnce(async () => false).mockImplementationOnce(async () => {
            authState.isAuthenticated = true;
            return true;
        });
        const { publishAuthState } = renderAuthPage("/auth/callback?redirectTo=/today");
        await act(() => vi.advanceTimersByTimeAsync(1_000));
        expect(authState.beginAuthRecovery).toHaveBeenCalledTimes(2);
        // Simulate the shared provider publishing the recovered identity.
        publishAuthState();
        expect(screen.getByText("Workspace")).toBeTruthy();
    });

    it("stops retries at the deadline when no session arrives", async () => {
        vi.useFakeTimers();
        renderAuthPage("/auth/callback");
        await act(() => vi.advanceTimersByTimeAsync(15_000));
        expect(screen.getByText("Sign-in didn't finish")).toBeTruthy();
        const calls = authState.beginAuthRecovery.mock.calls.length;
        await act(() => vi.advanceTimersByTimeAsync(5_000));
        expect(authState.beginAuthRecovery).toHaveBeenCalledTimes(calls);
    });

    it("times out a stalled request and does not retry it when it finishes late", async () => {
        vi.useFakeTimers();
        let finish!: (value: boolean) => void;
        authState.beginAuthRecovery.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
        renderAuthPage("/auth/callback");
        await act(() => vi.advanceTimersByTimeAsync(15_000));
        expect(screen.getByText("Sign-in didn't finish")).toBeTruthy();
        await act(async () => finish(false));
        await act(() => vi.advanceTimersByTimeAsync(5_000));
        expect(authState.beginAuthRecovery).toHaveBeenCalledOnce();
    });

    it("shows a failed verifier exchange without starting session recovery", () => {
        renderAuthPage("/auth/callback?auth_error=INVALID_VERIFIER");
        expect(screen.getByText("INVALID_VERIFIER")).toBeTruthy();
        expect(authState.beginAuthRecovery).not.toHaveBeenCalled();
    });

    it("cancels callback retries when the route unmounts", async () => {
        vi.useFakeTimers();
        const { unmount } = renderAuthPage("/auth/callback");
        await act(() => vi.advanceTimersByTimeAsync(0));
        unmount();
        await act(() => vi.advanceTimersByTimeAsync(20_000));
        expect(authState.beginAuthRecovery).toHaveBeenCalledOnce();
    });
    it("renders the centered sanctuary sign-in surface and labels icon-only auth buttons", async () => {
        const { layoutSection } = renderAuthPage("/auth/sign-in");

        expect(screen.getByText("Sign in to Cadence")).toBeTruthy();
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

        expect(screen.getByText("Create your account")).toBeTruthy();
        expect(screen.queryByText("A quiet space for your brightest thoughts")).toBeNull();
    });
});
