import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { AuthUIProvider } from "@neondatabase/auth/react/ui";
import { ThemeProvider } from "next-themes";
import { useNavigate, Link as RouterLink } from "react-router";
import { toast } from "sonner";
import { authClient } from "./lib/auth-client";
import { STALE_TIMES } from "./lib/api/query-keys";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ApiErrorResponse } from "./types/api";
import { AuthStateProvider, useAuthState } from "./hooks/use-auth-state";
import { Toaster } from "./components/feedback/Toaster";

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
    const { beginAuthRecovery, completeSignOut, session } = useAuthState();
    const lastUserId = useRef<string | null>(null);

    // Create QueryClient inside provider to prevent request crossover in SSR when caching
    const [queryClient] = useState(
        () =>
            new QueryClient({
                queryCache: new QueryCache({
                    onError: async (error) => {
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
                defaultOptions: {
                    queries: {
                        // Default to tasks stale time (most common query); hooks may override
                        staleTime: STALE_TIMES.TASKS,
                        gcTime: 1000 * 60 * 10, // 10 minutes — keep for back-nav
                        refetchOnWindowFocus: true, // Sync on tab return
                        retry: 2,
                        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
                    },
                    mutations: {
                        retry: 1,
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

    return (
        <QueryClientProvider client={queryClient}>
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
                        social={{
                            providers: ["google", "github"],
                        }}
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
                    </AuthUIProvider>
                </ThemeProvider>
            </div>
        </QueryClientProvider>
    );
}
