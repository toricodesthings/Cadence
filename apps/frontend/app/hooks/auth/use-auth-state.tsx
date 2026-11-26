import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
    useCallback,
    useRef,
    type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { clearAllDeviceLocationData } from "../../lib/location/device-location";
import { clearCachedBackgroundImages, setBackgroundCacheSessionActive } from "../../lib/themes/background-image-cache";
import { authClient } from "../../lib/auth-client";
import { jwtExpiry, readFreshSession, subscribeSessionExpiry } from "../../lib/auth/session";
import {
    clearDesktopAuthSession,
    readDesktopAuthSession,
    subscribeDesktopAuthSession,
    type DesktopAuthSessionData,
    type StoredDesktopAuthSession,
} from "../../lib/desktop-auth-session";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { clearAuthJwtCache, holdForSession, releaseSessionHold, seedAuthJwtCache } from "../../lib/api/client";
import { takePrefetchedSession } from "../../lib/auth/session-prefetch";
import { setDiagnosticsEnabled, setCrashReportsEnabled } from "../../lib/api/track-event";
import { startupMark, resetStartupTiming } from "../../lib/startup-timing";
import { isWorkspacePath } from "../../lib/auth/workspace-path";
import { log } from "../../lib/log";
import { forgetIdentity, readIdentity, rememberIdentity } from "../../lib/auth/offline-identity";
import { useOnlineStatus } from "../core/use-online-status";

type AuthStatus =
    | "bootstrapping"
    | "authenticated"
    | "offline"
    | "provisional"
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
    startupMark("session.start");
    const navigate = useNavigate();
    const location = useLocation();
    const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
    const online = useOnlineStatus();
    const [status, setStatus] = useState<AuthStatus>("bootstrapping");
    const [desktopSession, setDesktopSession] = useState<StoredDesktopAuthSession | null>(null);
    const [recovery, setRecovery] = useState<{ data: SessionData; sdk: SessionData } | null>(null);
    const sdkSessionRef = useRef(session);
    sdkSessionRef.current = session;
    const recoveredSession = recovery && recovery.sdk === session ? recovery.data : null;
    const [desktopSessionLoaded, setDesktopSessionLoaded] = useState(!IS_DESKTOP_RUNTIME);
    const recoveryPromise = useRef<Promise<boolean> | null>(null);
    const authRevision = useRef(0);
    const [sessionRejected, setSessionRejected] = useState(false);
    const rejectedToken = useRef<string | undefined>(undefined);
    const sdkSession =
        rejectedToken.current !== undefined && session?.session.token === rejectedToken.current ? null : session;
    const liveSession = sessionRejected ? null : (recoveredSession ?? sdkSession ?? desktopSession?.data ?? null);
    const [identity, setIdentity] = useState(readIdentity);
    const offlineSession = useMemo<DesktopAuthSessionData | null>(
        () =>
            !sessionRejected &&
            !liveSession &&
            identity &&
            (!online || (!isPending && sessionError && sessionError.status !== 401 && sessionError.status !== 403))
                ? { user: { ...identity }, session: {} }
                : null,
        [identity, isPending, liveSession, online, sessionError, sessionRejected],
    );
    const provisionalSession = useMemo<DesktopAuthSessionData | null>(
        () =>
            !IS_DESKTOP_RUNTIME &&
            !sessionRejected &&
            !liveSession &&
            !offlineSession &&
            identity &&
            (isPending || !desktopSessionLoaded) &&
            isWorkspacePath(location.pathname)
                ? { user: { ...identity }, session: {} }
                : null,
        [desktopSessionLoaded, identity, isPending, liveSession, location.pathname, offlineSession, sessionRejected],
    );
    const resolvedSession = liveSession ?? offlineSession ?? provisionalSession;
    const previousAccount = useRef<string | null>(null);

    useEffect(() => {
        let active = true;
        void takePrefetchedSession()?.then((early) => {
            if (active && early?.user.id)
                setRecovery((current) => current ?? { data: early as SessionData, sdk: sdkSessionRef.current });
        });
        return () => {
            active = false;
        };
    }, []);

    useLayoutEffect(() => {
        const userId = resolvedSession?.user.id ?? null;
        if (previousAccount.current !== userId) {
            if (previousAccount.current) {
                setDiagnosticsEnabled(false);
                setCrashReportsEnabled(false);
                clearAuthJwtCache();
                resetStartupTiming(false);
            }
            previousAccount.current = userId;
        }
        if (provisionalSession) {
            holdForSession();
            return;
        }
        if (userId) {
            startupMark("session.ready");
            seedAuthJwtCache(liveSession?.session?.token ?? desktopSession?.jwt, userId);
        }
        releaseSessionHold();
    }, [resolvedSession?.user.id, liveSession?.session?.token, desktopSession?.jwt, provisionalSession]);

    useEffect(() => {
        if (!liveSession?.user.id) return;
        rememberIdentity(liveSession.user);
        setIdentity(readIdentity());
    }, [liveSession?.user]);

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
            const valid = stored && jwtExpiry(stored.jwt) > Date.now() ? stored : null;
            setDesktopSession(valid);
            if (valid) setSessionRejected(false);
            setDesktopSessionLoaded(true);
        };

        void readDesktopAuthSession().then(apply, () => apply(null));
        const unsubscribe = subscribeDesktopAuthSession(apply);

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!sdkSession || !desktopSession) {
            return;
        }

        void clearDesktopAuthSession().catch(() => {});
    }, [desktopSession, sdkSession]);

    useEffect(() => {
        if (session?.session.token && session.session.token !== rejectedToken.current) {
            setSessionRejected(false);
        }
        if (recovery && recovery.sdk !== session) setRecovery(null);
    }, [session, recovery]);

    useEffect(
        () =>
            subscribeSessionExpiry(() => {
                authRevision.current++;
                rejectedToken.current = session?.session.token;
                setSessionRejected(true);
                setRecovery(null);
                setDesktopSession(null);
                clearAuthJwtCache();
                forgetIdentity();
                setIdentity(null);
                void clearDesktopAuthSession().catch(() => undefined);
                setStatus("anonymous");
            }),
        [session],
    );

    const statusRef = useRef(status);
    statusRef.current = status;

    useEffect(() => {
        if (sessionRejected) {
            setStatus("anonymous");
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

        if (provisionalSession) {
            setStatus("provisional");
            return;
        }

        if (!desktopSessionLoaded) {
            setStatus("bootstrapping");
            return;
        }

        if (isPending) {
            setStatus((current) => (current === "recoverable_error" ? "refreshing" : "bootstrapping"));
            return;
        }

        if (statusRef.current === "recoverable_error") {
            return;
        }

        setStatus("anonymous");
    }, [desktopSessionLoaded, isPending, liveSession, offlineSession, provisionalSession, sessionRejected]);

    useEffect(() => {
        if (status !== "anonymous") return;
        if (!isWorkspacePath(location.pathname)) return;
        navigate("/auth/sign-in", { replace: true, state: { from: location.pathname } });
    }, [location.pathname, navigate, status]);

    const beginAuthRecovery = useCallback(async () => {
        if (recoveryPromise.current) {
            return recoveryPromise.current;
        }
        const revision = authRevision.current;
        recoveryPromise.current = (async () => {
            clearAuthJwtCache();
            setStatus("refreshing");

            try {
                const result = await readFreshSession();
                if (revision !== authRevision.current) return false;
                if (result?.data) {
                    setSessionRejected(false);
                    setRecovery({ data: result.data, sdk: sdkSessionRef.current });
                    setStatus("authenticated");
                    return true;
                }
            } catch {
                log.warn("auth-recovery", "Session check failed");
            } finally {
                recoveryPromise.current = null;
            }

            if (revision !== authRevision.current) return false;
            setStatus("recoverable_error");
            return false;
        })();

        return recoveryPromise.current;
    }, []);

    const completeSignOut = useCallback(async () => {
        authRevision.current++;
        setDiagnosticsEnabled(false);
        setCrashReportsEnabled(false);
        setBackgroundCacheSessionActive(false);
        clearAuthJwtCache();
        forgetIdentity();
        setIdentity(null);
        clearAllDeviceLocationData();
        await clearCachedBackgroundImages();
        await clearDesktopAuthSession().catch(() => {});
        await authClient.signOut().catch((err: unknown) => {
            log.error("sign-out", "Couldn't end your session on the server.", err);
        });
        rejectedToken.current = session?.session.token;
        setSessionRejected(true);
        setRecovery(null);
        setDesktopSession(null);
        setStatus("anonymous");
        navigate("/auth/sign-in", { replace: true });
    }, [navigate, session]);

    const value = useMemo<AuthStateContextValue>(
        () => ({
            status,
            session: resolvedSession,
            isAuthenticated: Boolean(resolvedSession),
            authReady:
                status === "provisional" ||
                (desktopSessionLoaded && status !== "bootstrapping" && status !== "refreshing"),
            beginAuthRecovery,
            completeSignOut,
        }),
        [desktopSessionLoaded, resolvedSession, status, beginAuthRecovery, completeSignOut],
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
