import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import { useNavigate, Link as RouterLink } from "react-router";
import { authClient } from "./lib/auth-client";
import { STALE_TIMES } from "./lib/api/query-keys";
import { type ReactNode, useState } from "react";

// Adapter for react-router-dom Link (using react-router v7)
function Link({
    href,
    ...props
}: { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <RouterLink to={href} {...props} />;
}

export function Providers({ children }: { children: ReactNode }) {
    const navigate = useNavigate();

    // Create QueryClient inside provider to prevent request crossover in SSR when caching
    const [queryClient] = useState(
        () =>
            new QueryClient({
                queryCache: new QueryCache({
                    onError: (error) => {
                        // Global 401 handling — force sign-out on expired token
                        if (
                            error.message.includes("401") ||
                            error.message.includes("UNAUTHORIZED")
                        ) {
                            authClient.signOut();
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

    return (
        <QueryClientProvider client={queryClient}>
            <NeonAuthUIProvider
                authClient={authClient}
                navigate={(path) => navigate(path)}
                replace={(path) => navigate(path, { replace: true })}
                onSessionChange={() => {
                    // Optional: refresh data or invalidate cache on auth change
                    queryClient.invalidateQueries();
                }}
                Link={Link}
                social={{
                    providers: ["google", "github"],
                }}
                defaultTheme="dark" // We are aggressively going for the astral dark mode primarily
            >
                {children}
            </NeonAuthUIProvider>
        </QueryClientProvider>
    );
}
