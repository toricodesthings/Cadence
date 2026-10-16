import { StrictMode, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthStateProvider, useAuthState } from "../../../app/hooks/auth/use-auth-state";
import AuthPage from "../../../app/routes/auth";
import { prepareDesktopAuthHandoff } from "../../../app/platform/desktop-auth-handoff";
import { publishSessionExpiry } from "../../../app/lib/auth/session";
import { rememberIdentity } from "../../../app/lib/auth/offline-identity";

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), getSession: vi.fn(), signOut: vi.fn() }));
vi.mock("../../../app/lib/auth-client", () => ({ authClient: mocks }));
vi.mock("@neondatabase/auth/react/ui", () => ({ AuthView: () => null }));
vi.mock("../../../app/hooks/core/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("../../../app/platform/runtime", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../../app/platform/runtime")>(),
    IS_DESKTOP_RUNTIME: true,
    getDesktopStore: async () => null,
    hasDesktopWindow: () => false,
}));

const signedIn = { user: { id: "user-1" }, session: { token: "new-token" } };
let navigate: ReturnType<typeof useNavigate>;
function Probe() {
    navigate = useNavigate();
    const auth = useAuthState();
    const path = useLocation().pathname;
    return <div data-testid="auth-state">{`${path}:${auth.status}:${auth.session?.user.id ?? "none"}`}</div>;
}
function AccountBoundary({ children }: { children: ReactNode }) {
    const { session } = useAuthState();
    return <div key={session?.user.id ?? "anonymous"}>{children}</div>;
}
function App({ entry }: { entry: string }) {
    return <StrictMode><MemoryRouter initialEntries={[entry]}><AuthStateProvider>
        <Probe />
        <AccountBoundary><Routes>
            <Route path="/auth/:pathname" element={<AuthPage />} />
            <Route path="/today" element={<div>Workspace</div>} />
        </Routes></AccountBoundary>
    </AuthStateProvider></MemoryRouter></StrictMode>;
}

beforeEach(() => {
    mocks.useSession.mockReturnValue({ data: null, isPending: false });
    mocks.getSession.mockReset();
    mocks.signOut.mockReset();
    localStorage.clear();
});

it("finishes a callback once across StrictMode and the account remount, before the SDK subscriber catches up", async () => {
    const state = await prepareDesktopAuthHandoff("/today");
    const pending = Promise.withResolvers<{ data: typeof signedIn }>();
    mocks.getSession.mockReturnValue(pending.promise);
    const entry = `/auth/callback?redirectTo=/today&desktop_auth_state=${state}&neon_auth_session_verifier=one-time`;
    const app = render(<App entry={entry} />);
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledOnce());
    await act(async () => pending.resolve({ data: signedIn }));
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/today:authenticated:user-1"));
    expect(screen.queryByText("Sign-in failed")).toBeNull();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    mocks.useSession.mockReturnValue({ data: { user: { id: "user-2" }, session: { token: "another-account" } }, isPending: false });
    app.rerender(<App entry={entry} />);
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/today:authenticated:user-2"));
});

it("retries a settling session without consuming the desktop handoff again", async () => {
    const state = await prepareDesktopAuthHandoff("/today");
    mocks.getSession.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: signedIn });
    render(<App entry={`/auth/callback?redirectTo=/today&desktop_auth_state=${state}&neon_auth_session_verifier=one-time`} />);
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/today:authenticated:user-1"));
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
});

it("returns to sign-in after terminal expiry despite stale SDK data, without signing out on the server", async () => {
    mocks.useSession.mockReturnValue({ data: signedIn, isPending: false });
    render(<App entry="/today" />);
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/today:authenticated:user-1"));
    await act(async () => publishSessionExpiry());
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/auth/sign-in:anonymous:none"));
    expect(mocks.signOut).not.toHaveBeenCalled();

    // Sign back in without restarting the provider/app; the SDK still holds the old session.
    const state = await prepareDesktopAuthHandoff("/today");
    mocks.getSession.mockResolvedValue({ data: { ...signedIn, session: { token: "refreshed-token" } } });
    await act(async () => navigate(`/auth/callback?redirectTo=/today&desktop_auth_state=${state}&neon_auth_session_verifier=new-handoff`));
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/today:authenticated:user-1"));
    expect(mocks.getSession).toHaveBeenCalledOnce();
});

it("does not expose a remembered desktop account while reload is checking an expired session", async () => {
    rememberIdentity({ id: "user-1" });
    mocks.useSession.mockReturnValue({ data: null, isPending: true });
    const app = render(<App entry="/today" />);
    expect(screen.getByTestId("auth-state").textContent).toBe("/today:bootstrapping:none");
    mocks.useSession.mockReturnValue({ data: null, isPending: false });
    app.rerender(<App entry="/today" />);
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/auth/sign-in:anonymous:none"));
});

it("does not skip callback validation when an old SDK session still exists", async () => {
    mocks.useSession.mockReturnValue({ data: signedIn, isPending: false });
    render(<App entry="/auth/callback?redirectTo=/today&desktop_auth_state=unrequested&neon_auth_session_verifier=one-time" />);
    await screen.findByText("Sign-in failed");
    expect(screen.queryByText("Workspace")).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
});

it("accepts a live desktop session payload after expiry without resurrecting the rejected SDK token", async () => {
    mocks.useSession.mockReturnValue({ data: signedIn, isPending: false });
    const app = render(<App entry="/today" />);
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/today:authenticated:user-1"));
    await act(async () => publishSessionExpiry());
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/auth/sign-in:anonymous:none"));
    const state = await prepareDesktopAuthHandoff("/today");
    const jwt = `e30.${btoa(JSON.stringify({ sub: "payload-user", exp: Date.now() / 1000 + 60 }))}.signature`;
    const payload = btoa(JSON.stringify({ jwt, data: { user: { id: "payload-user" }, session: {} }, persistedAt: Date.now() }));
    await act(async () => navigate(`/auth/callback?redirectTo=/today&desktop_auth_state=${state}&desktop_oauth_payload=${encodeURIComponent(payload)}`));
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("/today:authenticated:payload-user"));
    app.unmount();
    const { clearDesktopAuthSession } = await import("../../../app/lib/desktop-auth-session");
    await clearDesktopAuthSession();
});
