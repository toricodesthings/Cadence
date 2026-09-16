import { QueryClient, QueryCache, MutationCache, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AuthUIProvider } from "@neondatabase/auth/react/ui";
import { ThemeProvider } from "next-themes";
import { useNavigate, Link as RouterLink } from "react-router";
import { toast } from "sonner";
import { authClient } from "./lib/auth-client";
import { STALE_TIMES } from "./lib/api/query-keys";
import { createIDBPersister } from "./lib/api/persister";
import { type ReactNode, Component, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorResponse } from "./types/api";
import { AuthStateProvider, useAuthState } from "./hooks/auth/use-auth-state";
import { BackgroundLayer } from "./components/settings/appearance/BackgroundLayer";
import { Toaster } from "./components/feedback/Toaster";
import { WorkspaceStartup } from "./components/layout/WorkspaceStartup";
import { OfflineBanner } from "./components/shared/OfflineBanner";
import { initWal } from "./lib/api/offline-wal";
import { replayWal } from "./lib/api/mutation-executor";
import {
    beginSocialSignIn,
    checkForAppUpdate,
    getCurrentAuthCallback,
    IS_DESKTOP_RUNTIME,
    listenForAuthCallback,
    normalizeRedirectTo,
} from "./platform/runtime";
import { installDesktopE2EBridge } from "./platform/desktop-e2e";
import { publishAvailableDesktopUpdate } from "./platform/desktop-update-state";

// Adapter for react-router-dom Link (using react-router v7)
function Link({
    href,
    ...props
}: { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <RouterLink to={href} {...props} />;
}

/**
 * Catches errors thrown during AuthStateProvider initialisation (e.g. if
 * useSession() fails in the browser bridge context) so children can still
 * render. The fallback re-renders children WITHOUT auth context, which is safe
 * for routes that don't depend on it (like DesktopBrowserCallbackBridgeScreen).
 */
class AuthErrorBoundary extends Component<
    { children: ReactNode; fallback: ReactNode },
    { hasError: boolean }
> {
    state = { hasError: false };
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error: unknown) {
        console.error("[cadence:auth-boundary] AuthStateProvider crashed:", error);
    }
    render() {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}

export function Providers({ children }: { children: ReactNode }) {
    return (
        <AuthErrorBoundary fallback={children}>
            <AuthStateProvider>
                <ProvidersInner>{children}</ProvidersInner>
            </AuthStateProvider>
        </AuthErrorBoundary>
    );
}

function ProvidersInner({ children }: { children: ReactNode }) {
    const { session } = useAuthState();
    // A new account must never construct observers over the previous account's
    // cache, even for one render while an effect is clearing it.
    return <AccountProviders key={session?.user.id ?? "anonymous"}>{children}</AccountProviders>;
}

function AccountProviders({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const { beginAuthRecovery, completeSignOut, session, authReady } = useAuthState();
    const hasCheckedForUpdates = useRef(false);

    // Keep fresh references for the QueryClient closure (created once in useState).
    const authRecoveryRef = useRef(beginAuthRecovery);
    const signOutRef = useRef(completeSignOut);
    const navigateRef = useRef(navigate);
    authRecoveryRef.current = beginAuthRecovery;
    signOutRef.current = completeSignOut;
    navigateRef.current = navigate;

    // Prevent concurrent/re-entrant recovery attempts from triggering a loop
    // when multiple queries fail with auth errors simultaneously.
    const recoveryInFlight = useRef(false);

    // Track queries that have already been retried after recovery to prevent
    // per-query recovery loops (query fails → recovery → retry → fails → …).
    const retriedAfterRecovery = useRef(new Set<string>());

    // Only retry errors the backend marks as retryable (429, 5xx).
    // Auth errors and validation errors are never retried.
    const shouldRetry = (failureCount: number, error: Error, maxRetries: number) => {
        if (!(error instanceof ApiErrorResponse)) return failureCount < maxRetries;
        if (error.isAuthError) return false;
        return error.isRetryable && failureCount < maxRetries;
    };

    // Exponential backoff — rate-limited requests back off more aggressively.
    const retryDelay = (attempt: number, error: Error) => {
        if (error instanceof ApiErrorResponse && error.isRateLimited) {
            return Math.min(2000 * 2 ** attempt, 16000);
        }
        return Math.min(1000 * 2 ** attempt, 8000);
    };

    // Create QueryClient inside provider to prevent request crossover in SSR when caching
    const [queryClient] = useState(
        () =>
            new QueryClient({
                queryCache: new QueryCache({
                    onError: async (error, query) => {
                        if (!(error instanceof ApiErrorResponse) || !error.isAuthError) {
                            return;
                        }

                        const queryKeyStr = JSON.stringify(query.queryKey);
                        console.warn("[cadence:query-cache] auth error for query:", queryKeyStr, error.code);

                        // Coalesce concurrent auth failures into a single recovery attempt.
                        if (recoveryInFlight.current) return;

                        // If this specific query already failed once after a recovery
                        // attempt, don't loop — the issue isn't session-level.
                        if (retriedAfterRecovery.current.has(queryKeyStr)) {
                            console.warn("[cadence:query-cache] query already retried after recovery, not looping:", queryKeyStr);
                            return;
                        }

                        recoveryInFlight.current = true;
                        try {
                            const recovered = await authRecoveryRef.current();
                            if (recovered) {
                                // Retry just this query — NOT all queries.
                                retriedAfterRecovery.current.add(queryKeyStr);
                                queryClient.invalidateQueries({ queryKey: query.queryKey });
                                // Allow a fresh retry after a cooldown.
                                setTimeout(() => retriedAfterRecovery.current.delete(queryKeyStr), 10_000);
                            } else if (error.code !== "AUTH_PROVIDER_UNAVAILABLE") {
                                await signOutRef.current();
                                navigateRef.current("/auth/sign-in", { replace: true });
                            }
                        } finally {
                            recoveryInFlight.current = false;
                        }
                    },
                }),
                mutationCache: new MutationCache(),
                defaultOptions: {
                    queries: {
                        // Default to tasks stale time (most common query); hooks may override
                        staleTime: STALE_TIMES.TASKS,
                        gcTime: 1000 * 60 * 10, // 10 minutes — keep for back-nav
                        refetchOnWindowFocus: true, // Sync on tab return
                        retry: (failureCount, error) => shouldRetry(failureCount, error, 3),
                        retryDelay,
                    },
                    mutations: {
                        retry: (failureCount, error) => shouldRetry(failureCount, error, 2),
                        retryDelay,
                    },
                },
            })
    );

    useEffect(() => {
        if (session) return;
        queryClient.removeQueries({ queryKey: ["settings"] });
    }, [queryClient, session]);

    // Layer 1+4: Initialize the durable WAL and replay pending mutations on reconnect
    useEffect(() => {
        initWal().then(() => {
            // Replay any mutations that were queued while offline (previous session)
            if (navigator.onLine) {
                replayWal(queryClient);
            }
        });

        const handleOnline = () => {
            replayWal(queryClient);
        };
        window.addEventListener("online", handleOnline);
        return () => window.removeEventListener("online", handleOnline);
    }, [queryClient]);

    // Desktop deep-link callbacks only. On the web the browser is already on
    // /auth/callback, and re-navigating there after the account remount cancels
    // the in-flight redirect into the workspace (seen on slower mobile loads).
    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) return;

        let unlisten: (() => void) | undefined;
        let active = true;

        const handleCallback = (url: URL) => {
            const params = new URLSearchParams(url.search);
            const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;

            if (hash.includes("=")) {
                const hashParams = new URLSearchParams(hash);
                hashParams.forEach((value, key) => {
                    if (!params.has(key)) {
                        params.set(key, value);
                    }
                });
            }

            params.set("redirectTo", normalizeRedirectTo(params.get("redirectTo")));

            const search = params.toString();
            navigate(search ? `/auth/callback?${search}` : "/auth/callback", { replace: true });
        };

        void getCurrentAuthCallback().then((url) => {
            if (active && url) {
                handleCallback(url);
            }
        });

        void listenForAuthCallback((url) => {
            if (active) {
                handleCallback(url);
            }
        }).then((dispose) => {
            unlisten = dispose;
        });

        return () => {
            active = false;
            unlisten?.();
        };
    }, [navigate]);

    useEffect(() => installDesktopE2EBridge(), []);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME || !authReady || hasCheckedForUpdates.current) {
            return;
        }

        hasCheckedForUpdates.current = true;
        let active = true;

        void checkForAppUpdate().then((update) => {
            if (!active || !update) {
                publishAvailableDesktopUpdate(null);
                return;
            }

            publishAvailableDesktopUpdate(update);

            toast.info(`Cadence ${update.version} is ready to install.`, {
                description: "Open Settings > Privacy & Data to review release notes and apply the update.",
            });
        }).catch(() => {
            hasCheckedForUpdates.current = false;
        });

        return () => {
            active = false;
        };
    }, [authReady]);

    const persistOptions = useMemo(
        () => ({
            // Do not discard the saved account cache while auth is unresolved.
            persister: session?.user.id ? createIDBPersister() : {
                persistClient: async () => {},
                restoreClient: async () => undefined,
                removeClient: async () => {},
            },
            maxAge: 1000 * 60 * 60 * 24, // 24 hours
            buster: session?.user.id ?? "",
            // Queries marked `meta: { persist: false }` (location, weather) stay in memory only.
            dehydrateOptions: {
                shouldDehydrateQuery: (query: Parameters<typeof defaultShouldDehydrateQuery>[0]) =>
                    defaultShouldDehydrateQuery(query) && query.meta?.persist !== false,
            },
        }),
        [session?.user.id],
    );

    const social = useMemo(
        () => ({
            providers: ["google", "github"],
            ...(IS_DESKTOP_RUNTIME
                ? {
                    signIn: async ({
                        provider,
                        callbackURL,
                    }: {
                        provider: string;
                        callbackURL?: string;
                    }) => {
                        if (provider !== "google" && provider !== "github") {
                            await authClient.signIn.social({
                                provider,
                                callbackURL,
                                fetchOptions: { throw: true },
                            });
                            return;
                        }

                        await beginSocialSignIn(provider, callbackURL);
                    },
                }
                : {}),
        }),
        [],
    );

    return (
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <div className="neon-auth-ui">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem
                >
                    <AuthUIProvider
                        authClient={authClient}
                        navigate={(path) => navigate(path)}
                        replace={(path) => navigate(path, { replace: true })}
                        onSessionChange={() => {
                            // Skip broad invalidation while auth recovery is in
                            // progress — recovery may trigger onSessionChange via
                            // getSession(), which would cascade into a refetch loop.
                            if (recoveryInFlight.current) return;
                            queryClient.invalidateQueries();
                        }}
                        Link={Link}
                        social={social as any}
                        multiSession={false}
                        apiKey={false}
                        magicLink={false}
                        passkey={false}
                        oneTap={false}
                        genericOAuth={undefined}
                        twoFactor={undefined}
                        toast={({ variant = "default", message }) => {
                            if (!message) return;

                            switch (variant) {
                                case "success":
                                    toast.success(message);
                                    return;
                                case "error":
                                    toast.error(message);
                                    return;
                                case "warning":
                                    toast.warning(message);
                                    return;
                                case "info":
                                    toast.info(message);
                                    return;
                                default:
                                    toast.message(message);
                            }
                        }}
                    >
                        {authReady && session?.user.id && <BackgroundLayer key={session.user.id} />}
                        <div className="relative">
                            <WorkspaceStartup>{children}</WorkspaceStartup>
                        </div>
                        <Toaster />
                        <OfflineBanner />
                    </AuthUIProvider>
                </ThemeProvider>
            </div>
        </PersistQueryClientProvider>
    );
}
