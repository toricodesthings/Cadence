import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "../../../app/routes/auth";
import { takeSignUpTicks } from "../../../app/lib/legal-consent";

const authState = vi.hoisted(() => ({
    beginAuthRecovery: vi.fn(),
    authReady: true,
    isAuthenticated: false,
    session: null,
}));

vi.mock("@neondatabase/auth/react/ui", () => ({
    AuthView: ({ view }: { view: "SIGN_IN" | "SIGN_UP" }) => (
        <div data-testid="auth-view" data-view={view}>
            <div>{[0, 1].map((i) => <button key={i} type="button"><svg aria-hidden="true" /></button>)}</div>
            <div><input type="password" /><button type="button"><svg aria-hidden="true" /></button></div>
        </div>
    ),
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
    getAuthCallbackUrl: (redirectTo: string) => `/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
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
                <Route path="/today" element={<div>Workspace</div>} />
            </Routes>
        </MemoryRouter>
    );
    const result = render(tree());
    return { ...result, publishAuthState: () => result.rerender(tree()) };
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
        const { promise, resolve: finish } = Promise.withResolvers<boolean>();
        authState.beginAuthRecovery.mockReturnValue(promise);
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
    it("renders the sign-in surface and labels icon-only auth buttons", async () => {
        renderAuthPage("/auth/sign-in");

        expect(screen.getByText("Sign in to Cadence")).toBeTruthy();
        expect(screen.getByRole("img", { name: "Cadence" }).getAttribute("src")).toBe("/logo.png");

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

    it("keeps sign-up disabled until both the 16+ and the terms boxes are ticked, and leaves sign-in ungated", () => {
        localStorage.clear();
        const { unmount } = renderAuthPage("/auth/sign-up");
        const social = screen.getAllByRole("button")[0]!;
        expect(social.matches(":disabled")).toBe(true);
        fireEvent.click(screen.getByRole("checkbox", { name: /16 years old or older/ }));
        expect(social.matches(":disabled")).toBe(true);
        fireEvent.click(screen.getByRole("checkbox", { name: /accept the Terms of Service and Privacy Policy/ }));
        expect(social.matches(":disabled")).toBe(false);
        // The ticks survive the round trip through Google/GitHub so the new account isn't asked again
        expect(takeSignUpTicks()).not.toBeNull();
        unmount();

        renderAuthPage("/auth/sign-in");
        expect(screen.queryByRole("checkbox")).toBeNull();
    });
});
