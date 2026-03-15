import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStateProvider, useAuthState } from "../../../app/hooks/auth/use-auth-state";

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
});
