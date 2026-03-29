import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { authClient } from "../../lib/auth-client";
import {
    clearDesktopAuthSession,
    readDesktopAuthSession,
    subscribeDesktopAuthSession,
    type DesktopAuthSessionData,
    type StoredDesktopAuthSession,
} from "../../lib/desktop-auth-session";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { clearAuthJwtCache } from "../../lib/api/client";

type AuthStatus =
    | "bootstrapping"
    | "authenticated"
    | "anonymous"
    | "refreshing"
    | "recoverable_error";

type SessionData = ReturnType<typeof authClient.useSession>["data"];
type ResolvedSessionData = SessionData | DesktopAuthSessionData;

interface AuthStateContextValue {
    status: AuthStatus;
    session: ResolvedSessionData | null;
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
    const { data: session, isPending } = authClient.useSession();
    const [status, setStatus] = useState<AuthStatus>("bootstrapping");
    const [desktopSession, setDesktopSession] = useState<StoredDesktopAuthSession | null>(null);
    const [recoveredSession, setRecoveredSession] = useState<SessionData | null>(null);
    const [desktopSessionLoaded, setDesktopSessionLoaded] = useState(!IS_DESKTOP_RUNTIME);
    const recoveryPromise = useRef<Promise<boolean> | null>(null);
    const resolvedSession = session ?? recoveredSession ?? desktopSession?.data ?? null;

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        let active = true;

        void readDesktopAuthSession().then((stored) => {
            if (!active) {
                return;
            }

            setDesktopSession(stored);
            setDesktopSessionLoaded(true);
        });

        const unsubscribe = subscribeDesktopAuthSession((stored) => {
            if (!active) {
                return;
            }

            setDesktopSession(stored);
            setDesktopSessionLoaded(true);
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!session || !desktopSession) {
            return;
        }

        void clearDesktopAuthSession().catch(() => {
            // Ignore desktop fallback cleanup failures; the live SDK session wins.
        });
    }, [desktopSession, session]);

    useEffect(() => {
        if (!session) {
            return;
        }

        setRecoveredSession(null);
    }, [session]);

    // Use a ref to read latest status inside the effect without adding it as a
    // dependency (which would cause re-fire loops when status changed).
    const statusRef = useRef(status);
    statusRef.current = status;

    useEffect(() => {
        if (!desktopSessionLoaded) {
            setStatus("bootstrapping");
            return;
        }

        if (isPending) {
            setStatus((current) =>
                current === "recoverable_error" ? "refreshing" : "bootstrapping",
            );
            return;
        }

        if (resolvedSession) {
            setStatus("authenticated");
            return;
        }

        if (statusRef.current === "recoverable_error") {
            return;
        }

        setStatus("anonymous");
    }, [desktopSessionLoaded, isPending, resolvedSession]);

    useEffect(() => {
        if (status !== "anonymous") return;
        if (!isProtectedPath(location.pathname)) return;
        navigate("/auth/sign-in", { replace: true, state: { from: location.pathname } });
    }, [location.pathname, navigate, status]);

    const beginAuthRecovery = useCallback(async () => {
        // Coalesce concurrent callers onto the same recovery work so one screen
        // cannot render a failure while another caller completes successfully.
        if (recoveryPromise.current) {
            return recoveryPromise.current;
        }
        // If already authenticated, the session is live — no recovery needed.
        // This prevents cascading loops where onSessionChange → invalidateQueries
        // → query 401 → onError → beginAuthRecovery → getSession → onSessionChange …
        if (statusRef.current === "authenticated") {
            return true;
        }
        recoveryPromise.current = (async () => {
            clearAuthJwtCache();
            setStatus("refreshing");

            try {
                const storedDesktopSession = await readDesktopAuthSession();
                if (storedDesktopSession?.data) {
                    setRecoveredSession(null);
                    setDesktopSession(storedDesktopSession);
                    setStatus("authenticated");
                    return true;
                }

                const result = await authClient.getSession();
                if (result?.data) {
                    // NOTE: Do NOT call refetch() here. getSession() already updates
                    // the SDK's internal session cache, and useSession() picks it up.
                    // Calling refetch() triggers onSessionChange → invalidateQueries()
                    // which can cascade into a recovery loop.
                    setRecoveredSession(result.data);
                    setStatus("authenticated");
                    return true;
                }
            } catch (err) {
                console.error("[cadence:auth-recovery] getSession threw:", err);
            } finally {
                recoveryPromise.current = null;
            }

            console.warn("[cadence:auth-state] auth recovery failed to restore any session");
            setStatus("recoverable_error");
            return false;
        })();

        return recoveryPromise.current;
    }, []);

    const completeSignOut = useCallback(async () => {
        clearAuthJwtCache();
        await clearDesktopAuthSession().catch(() => {
            // Ignore desktop fallback cleanup failures during sign out.
        });
        await authClient.signOut().catch(() => {
            // Desktop OAuth fallback may not have an SDK-backed session to revoke.
        });
        setRecoveredSession(null);
        setDesktopSession(null);
        setStatus("anonymous");
        navigate("/auth/sign-in", { replace: true });
    }, [navigate]);

    const value = useMemo<AuthStateContextValue>(
        () => ({
            status,
            session: resolvedSession,
            isAuthenticated: Boolean(resolvedSession),
            authReady: desktopSessionLoaded && status !== "bootstrapping" && status !== "refreshing",
            beginAuthRecovery,
            completeSignOut,
        }),
        [desktopSessionLoaded, resolvedSession, status],
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
