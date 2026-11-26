import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import { Location } from "../../helpers";

const mocks = vi.hoisted(() => ({
    signUp: vi.fn(async () => ({ token: null })),
    signIn: vi.fn(async () => ({})),
    auth: { authReady: true, isAuthenticated: false, beginAuthRecovery: vi.fn(async () => true) },
}));
vi.mock("../../../app/lib/auth-client", () => ({
    authClient: { signUp: { email: mocks.signUp }, signIn: { email: mocks.signIn } },
}));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => mocks.auth }));
vi.mock("@neondatabase/auth/react/ui", () => ({ AuthView: () => null }));
vi.mock("../../../app/hooks/core/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("../../../app/platform/runtime", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../../app/platform/runtime")>()),
    IS_DESKTOP_RUNTIME: true,
}));

import AuthPage from "../../../app/routes/auth";

const JOIN = "/join/AAAA";

it("signs up, goes to sign-in still holding the link (state.from), then signs in and lands on the link", async () => {
    render(
        <MemoryRouter initialEntries={[`/auth/sign-up?redirectTo=${encodeURIComponent(JOIN)}`]}>
            <Routes>
                <Route path="/auth/sign-up" element={<AuthPage />} />
                <Route path="/auth/sign-in" element={<AuthPage />} />
                <Route path="*" element={<Location />} />
            </Routes>
        </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /16 years old or older/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /accept the Terms/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ben" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ben@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-password" } });
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);

    expect(await screen.findByText("Sign in to see what was shared with you.")).toBeTruthy();
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: JOIN }));

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ben@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-password" } });
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    await waitFor(() => expect(screen.getByLabelText("Current location").textContent).toBe(JOIN));
});
