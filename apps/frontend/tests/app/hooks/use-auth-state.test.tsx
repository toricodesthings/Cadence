import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStateProvider, useAuthState } from "../../../app/hooks/auth/use-auth-state";
import { useLocation } from "react-router";
import { rememberIdentity } from "../../../app/lib/auth/offline-identity";
import { isSessionHeld, releaseSessionHold } from "../../../app/lib/api/client";

const authMocks = vi.hoisted(() => ({
    useSessionMock: vi.fn(),
    getSessionMock: vi.fn(),
    signOutMock: vi.fn(),
}));

vi.mock("../../../app/lib/auth-client", () => ({
    authClient: {
        useSession: authMocks.useSessionMock,
        getSession: authMocks.getSessionMock,
        signOut: authMocks.signOutMock,
    },
}));

function wrapper({ children }: { children: React.ReactNode }) {
    return (
        <MemoryRouter initialEntries={["/"]}>
            <AuthStateProvider>{children}</AuthStateProvider>
        </MemoryRouter>
    );
}

describe("use-auth-state", () => {
    beforeEach(() => {
        authMocks.useSessionMock.mockReset();
        authMocks.getSessionMock.mockReset();
        authMocks.signOutMock.mockReset();
    });

    it("reports bootstrapping while the auth client is pending", () => {
        authMocks.useSessionMock.mockReturnValue({
            data: null,
            isPending: true,
            refetch: vi.fn(),
        });

        const { result } = renderHook(() => useAuthState(), { wrapper });

        expect(result.current.status).toBe("bootstrapping");
        expect(result.current.authReady).toBe(false);
    });

    it("marks the session authenticated when session data exists", async () => {
        authMocks.useSessionMock.mockReturnValue({
            data: { user: { id: "user-1" }, session: { token: "jwt" } },
            isPending: false,
            refetch: vi.fn(),
        });

        const { result } = renderHook(() => useAuthState(), { wrapper });

        await waitFor(() => {
            expect(result.current.status).toBe("authenticated");
        });
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.authReady).toBe(true);
    });

    it("moves to recoverable_error when recovery cannot restore a session", async () => {
        const refetch = vi.fn();
        authMocks.useSessionMock.mockReturnValue({
            data: null,
            isPending: false,
            refetch,
        });
        authMocks.getSessionMock.mockResolvedValue({ data: null });

        const { result } = renderHook(() => useAuthState(), { wrapper });

        await expect(result.current.beginAuthRecovery()).resolves.toBe(false);
        await waitFor(() => {
            expect(result.current.status).toBe("recoverable_error");
        });
    });

    it("accepts a recovered session while the SDK subscriber is still pending", async () => {
        authMocks.useSessionMock.mockReturnValue({ data: null, isPending: true });
        const session = { user: { id: "user-1" }, session: { token: "jwt" } };
        authMocks.getSessionMock.mockResolvedValue({ data: session });
        const { result } = renderHook(() => useAuthState(), { wrapper });

        await act(async () => {
            expect(await result.current.beginAuthRecovery()).toBe(true);
        });

        expect(result.current.session).toEqual(session);
        expect(result.current.status).toBe("authenticated");
        expect(result.current.authReady).toBe(true);
    });

    it("signs out through the shared auth-state helper", async () => {
        const refetch = vi.fn();
        authMocks.useSessionMock.mockReturnValue({
            data: { user: { id: "user-1" }, session: { token: "jwt" } },
            isPending: false,
            refetch,
        });
        authMocks.signOutMock.mockResolvedValue({ error: null });

        const { result } = renderHook(() => useAuthState(), { wrapper });

        await waitFor(() => {
            expect(result.current.status).toBe("authenticated");
        });

        localStorage.setItem("cadence:device-location:user-1", JSON.stringify({ place: {}, refreshedAt: "" }));

        await result.current.completeSignOut();

        expect(authMocks.signOutMock).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem("cadence:device-location:user-1")).toBeNull();
    });

    it("opens the last account's workspace when the session can't be checked offline", async () => {
        const refetch = vi.fn();
        authMocks.useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "a@b.c" }, session: { token: "jwt" } }, isPending: false, refetch });
        const first = renderHook(() => useAuthState(), { wrapper });
        await waitFor(() => expect(first.result.current.status).toBe("authenticated"));
        first.unmount();

        authMocks.useSessionMock.mockReturnValue({ data: null, isPending: false, error: { message: "Failed to fetch" }, refetch });
        const { result } = renderHook(() => useAuthState(), { wrapper });

        await waitFor(() => expect(result.current.status).toBe("offline"));
        expect(result.current.session?.user.id).toBe("user-1");
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.authReady).toBe(true);

        authMocks.signOutMock.mockResolvedValue({ error: null });
        await result.current.completeSignOut();
        expect(localStorage.getItem("cadence-offline-identity")).toBeNull();
    });

    describe("provisional warm start", () => {
        const pending = { data: null, isPending: true, refetch: vi.fn() };
        const view = () => renderHook(() => ({ auth: useAuthState(), path: useLocation().pathname }), { wrapper });
        afterEach(() => releaseSessionHold());

        it("opens the remembered account's saved workspace while API calls wait for the session", () => {
            rememberIdentity({ id: "user-1", email: "a@b.c" });
            authMocks.useSessionMock.mockReturnValue(pending);
            const { result } = view();
            expect(result.current.auth.status).toBe("provisional");
            expect(result.current.auth.session?.user.id).toBe("user-1");
            expect(result.current.auth.authReady).toBe(true);
            expect(isSessionHeld()).toBe(true);
        });

        it("releases the calls when the same account's session arrives", async () => {
            rememberIdentity({ id: "user-1" });
            authMocks.useSessionMock.mockReturnValue(pending);
            const { result, rerender } = view();
            authMocks.useSessionMock.mockReturnValue({ data: { user: { id: "user-1" }, session: { token: "jwt" } }, isPending: false, refetch: vi.fn() });
            rerender();
            await waitFor(() => expect(result.current.auth.status).toBe("authenticated"));
            expect(isSessionHeld()).toBe(false);
        });

        it("sends a session that comes back anonymous to sign-in", async () => {
            rememberIdentity({ id: "user-1" });
            authMocks.useSessionMock.mockReturnValue(pending);
            const { result, rerender } = view();
            authMocks.useSessionMock.mockReturnValue({ data: null, isPending: false, refetch: vi.fn() });
            rerender();
            await waitFor(() => expect(result.current.path).toBe("/auth/sign-in"));
            expect(result.current.auth.session).toBeNull();
            expect(isSessionHeld()).toBe(false);
        });

        it("switches to a different account that comes back (its own isolated cache)", async () => {
            rememberIdentity({ id: "user-1" });
            authMocks.useSessionMock.mockReturnValue(pending);
            const { result, rerender } = view();
            authMocks.useSessionMock.mockReturnValue({ data: { user: { id: "user-2" }, session: { token: "jwt" } }, isPending: false, refetch: vi.fn() });
            rerender();
            await waitFor(() => expect(result.current.auth.session?.user.id).toBe("user-2"));
            expect(isSessionHeld()).toBe(false);
        });

        it("never shows a saved workspace on auth or consent pages", () => {
            rememberIdentity({ id: "user-1" });
            authMocks.useSessionMock.mockReturnValue(pending);
            const { result } = renderHook(() => useAuthState(), {
                wrapper: ({ children }) => <MemoryRouter initialEntries={["/connect"]}><AuthStateProvider>{children}</AuthStateProvider></MemoryRouter>,
            });
            expect(result.current.status).toBe("bootstrapping");
            expect(isSessionHeld()).toBe(false);
        });
    });
});
