import { lazy, Suspense, type ComponentProps } from "react";
import { useLocation } from "react-router";
import type { AuthUIProvider } from "@neondatabase/auth/react/ui";
import { Loading } from "./Loading";

const Provider = lazy(() => import("@neondatabase/auth/react/ui").then((module) => ({ default: module.AuthUIProvider })));

/** Only AuthView consumes this SDK context; workspace controls use our auth state. */
export function AuthUIBoundary(props: ComponentProps<typeof AuthUIProvider>) {
    const { pathname } = useLocation();
    if (pathname !== "/auth" && !pathname.startsWith("/auth/")) return props.children;
    return <Suspense fallback={<Loading />}><Provider {...props} /></Suspense>;
}
