import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AuthUIProvider } from "@neondatabase/auth/react/ui";
import { ThemeProvider } from "next-themes";
import { useNavigate, Link as RouterLink } from "react-router";
import { toast } from "sonner";
import { authClient } from "./lib/auth-client";
import { STALE_TIMES } from "./lib/api/query-keys";
import { createIDBPersister } from "./lib/api/persister";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorResponse } from "./types/api";
import { AuthStateProvider, useAuthState } from "./hooks/auth/use-auth-state";
import { Toaster } from "./components/feedback/Toaster";
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

// Adapter for react-router-dom Link (using react-router v7)
function Link({
    href,
    ...props
}: { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <RouterLink to={href} {...props} />;
}

export function Providers({ children }: { children: ReactNode }) {
    return (
        <AuthStateProvider>
            <ProvidersInner>{children}</ProvidersInner>
        </AuthStateProvider>
    );
}

function ProvidersInner({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const { beginAuthRecovery, completeSignOut, session, authReady } = useAuthState();
    const lastUserId = useRef<string | null>(null);
    const hasCheckedForUpdates = useRef(false);

    // Only retry errors the backend marks as retryable (429, 5xx).
    // Auth errors and validation errors are never retried.
    const shouldRetry = (failureCount: number, error: Error, maxRetries: number) => {
        if (!(error instanceof ApiErrorResponse)) return failureCount < maxRetries;
        if (error.isAuthError) return false;
        return error.isRetryable && failureCount < maxRetries;
    };

    // Use Retry-After header when available (rate limits), otherwise exponential backoff.
    const retryDelay = (attempt: number, error: Error) => {
        if (error instanceof ApiErrorResponse && error.isRateLimited) {
            return Math.min(2000 * 2 ** attempt, 16000);
        }
        return Math.min(1000 * 2 ** attempt, 8000);
    };

    // Show toast for exhausted rate-limit retries
    const handleRateLimitExhausted = (error: Error) => {
        if (error instanceof ApiErrorResponse && error.isRateLimited) {
            toast.error("You're doing that too fast — please wait a moment and try again.");
        }
    };

    // Create QueryClient inside provider to prevent request crossover in SSR when caching
    const [queryClient] = useState(
        () =>
            new QueryClient({
                queryCache: new QueryCache({
                    onError: async (error) => {
                        handleRateLimitExhausted(error);

                        if (!(error instanceof ApiErrorResponse) || !error.isAuthError) {
                            return;
                        }

                        const recovered = await beginAuthRecovery();
                        if (!recovered && error.code !== "AUTH_PROVIDER_UNAVAILABLE") {
                            await completeSignOut();
                            navigate("/auth/sign-in", { replace: true });
                        }
                    },
                }),
                mutationCache: new MutationCache({
                    onError: (error) => {
                        handleRateLimitExhausted(error);
                    },
                }),
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
        const currentUserId = session?.user.id ?? null;
        if (lastUserId.current && lastUserId.current !== currentUserId) {
            queryClient.clear();
        }
        lastUserId.current = currentUserId;
    }, [queryClient, session?.user.id]);

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

    useEffect(() => {
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

            if (import.meta.env.DEV) {
                console.info("[cadence:desktop-auth] received callback", {
                    pathname: url.pathname,
                    searchKeys: Array.from(params.keys()),
                    hasHash: Boolean(hash),
                });
            }

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
                return;
            }

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
            persister: createIDBPersister(),
            maxAge: 1000 * 60 * 60 * 24, // 24 hours
            buster: session?.user.id ?? "",
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
                        {children}
                        <Toaster />
                        <OfflineBanner />
                    </AuthUIProvider>
                </ThemeProvider>
            </div>
        </PersistQueryClientProvider>
    );
}
