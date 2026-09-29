import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { clearAllDeviceLocationData } from "../../lib/location/device-location";
import { clearCachedBackgroundImages, setBackgroundCacheSessionActive } from "../../lib/themes/background-image-cache";
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
import { isWorkspacePath } from "../../lib/auth/workspace-path";
import { log } from "../../lib/log";
import { forgetIdentity, readIdentity, rememberIdentity } from "../../lib/auth/offline-identity";
import { useOnlineStatus } from "../core/use-online-status";

type AuthStatus =
    | "bootstrapping"
    | "authenticated"
    /** No connection to check the session; running on the last signed-in identity and cached data. */
    | "offline"
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

export function AuthStateProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
    const online = useOnlineStatus();
    const [status, setStatus] = useState<AuthStatus>("bootstrapping");
    const [desktopSession, setDesktopSession] = useState<StoredDesktopAuthSession | null>(null);
    const [recoveredSession, setRecoveredSession] = useState<SessionData | null>(null);
    const [desktopSessionLoaded, setDesktopSessionLoaded] = useState(!IS_DESKTOP_RUNTIME);
    const recoveryPromise = useRef<Promise<boolean> | null>(null);
    const liveSession = session ?? recoveredSession ?? desktopSession?.data ?? null;
    // The session request failed (or can't be sent): open the last account's
    // cached workspace. A request that answers "no session" has no error.
    const [identity, setIdentity] = useState(readIdentity);
    const offlineSession = useMemo<DesktopAuthSessionData | null>(
        () => (!liveSession && identity && (!online || (!isPending && sessionError))
            ? { user: { ...identity }, session: {} }
            : null),
        [identity, isPending, liveSession, online, sessionError],
    );
    const resolvedSession = liveSession ?? offlineSession;

    useEffect(() => {
        if (!liveSession?.user.id) return;
        rememberIdentity(liveSession.user);
        setIdentity(readIdentity());
    }, [liveSession?.user]);

    // Check the session again as soon as the connection is back.
    useEffect(() => {
        if (offlineSession && online) void refetch?.();
    }, [offlineSession, online, refetch]);

    useEffect(() => {
        setBackgroundCacheSessionActive(Boolean(resolvedSession?.user.id));
    }, [resolvedSession?.user.id]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        let active = true;
        const apply = (stored: StoredDesktopAuthSession | null) => {
            if (!active) return;
            setDesktopSession(stored);
            setDesktopSessionLoaded(true);
        };

        void readDesktopAuthSession().then(apply);
        const unsubscribe = subscribeDesktopAuthSession(apply);

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

        if (liveSession) {
            setStatus("authenticated");
            return;
        }

        if (offlineSession) {
            setStatus("offline");
            return;
        }

        if (isPending) {
            setStatus((current) =>
                current === "recoverable_error" ? "refreshing" : "bootstrapping",
            );
            return;
        }

        if (statusRef.current === "recoverable_error") {
            return;
        }

        setStatus("anonymous");
    }, [desktopSessionLoaded, isPending, liveSession, offlineSession]);

    useEffect(() => {
        if (status !== "anonymous") return;
        if (!isWorkspacePath(location.pathname)) return;
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
                    // Keep the returned session while the SDK subscriber catches up;
                    // no second session request is needed.
                    setRecoveredSession(result.data);
                    setStatus("authenticated");
                    return true;
                }
            } catch (err) {
                log.warn("auth-recovery", "getSession threw", err);
            } finally {
                recoveryPromise.current = null;
            }

            setStatus("recoverable_error");
            return false;
        })();

        return recoveryPromise.current;
    }, []);

    const completeSignOut = useCallback(async () => {
        setBackgroundCacheSessionActive(false);
        clearAuthJwtCache();
        forgetIdentity();
        setIdentity(null);
        clearAllDeviceLocationData();
        await clearCachedBackgroundImages();
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
