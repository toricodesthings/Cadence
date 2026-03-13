import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";

type AuthStatus =
    | "bootstrapping"
    | "authenticated"
    | "anonymous"
    | "refreshing"
    | "recoverable_error";

type SessionData = ReturnType<typeof authClient.useSession>["data"];

interface AuthStateContextValue {
    status: AuthStatus;
    session: SessionData | null;
    isAuthenticated: boolean;
    authReady: boolean;
    beginAuthRecovery: () => Promise<boolean>;
    completeSignOut: () => Promise<void>;
}

const AuthStateContext = createContext<AuthStateContextValue | null>(null);

const PROTECTED_PREFIXES = ["/", "/today", "/schedule", "/upcoming", "/completed", "/trash", "/project", "/habits", "/weekly-review"];

function isProtectedPath(pathname: string) {
    return PROTECTED_PREFIXES.some((prefix) =>
        prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

export function AuthStateProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: session, isPending, refetch } = authClient.useSession();
    const [status, setStatus] = useState<AuthStatus>("bootstrapping");

    useEffect(() => {
        if (isPending) {
            setStatus((current) =>
                current === "recoverable_error" ? "refreshing" : "bootstrapping",
            );
            return;
        }

        if (session) {
            setStatus("authenticated");
            return;
        }

        if (status === "recoverable_error") {
            return;
        }

        setStatus("anonymous");
    }, [isPending, session, status]);

    useEffect(() => {
        if (status !== "anonymous") return;
        if (!isProtectedPath(location.pathname)) return;
        navigate("/auth/sign-in", { replace: true, state: { from: location.pathname } });
    }, [location.pathname, navigate, status]);

    const beginAuthRecovery = async () => {
        setStatus("refreshing");
        try {
            const result = await authClient.getSession();
            if (result?.data) {
                await refetch();
                setStatus("authenticated");
                return true;
            }
        } catch {
            // Fall through to recoverable_error.
        }

        setStatus("recoverable_error");
        return false;
    };

    const completeSignOut = async () => {
        await authClient.signOut();
        setStatus("anonymous");
        navigate("/auth/sign-in", { replace: true });
    };

    const value = useMemo<AuthStateContextValue>(
        () => ({
            status,
            session: session ?? null,
            isAuthenticated: Boolean(session),
            authReady: status !== "bootstrapping" && status !== "refreshing",
            beginAuthRecovery,
            completeSignOut,
        }),
        [session, status],
    );

    return <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>;
}

export function useAuthState() {
    const value = useContext(AuthStateContext);
    if (!value) {
        throw new Error("useAuthState must be used within AuthStateProvider");
    }
    return value;
}
