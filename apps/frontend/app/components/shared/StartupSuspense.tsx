import { Suspense, useContext, useEffect, type ReactNode } from "react";
import { StartupRenderContext } from "../../hooks/core/use-workspace-startup";

function Pending({ children }: { children: ReactNode }) {
    const trackRender = useContext(StartupRenderContext);
    useEffect(() => {
        trackRender(1);
        return () => trackRender(-1);
    }, [trackRender]);
    return children;
}

/** Include code-split content in first-screen readiness, before its queries mount. */
export function StartupSuspense({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
    return <Suspense fallback={<Pending>{fallback}</Pending>}>{children}</Suspense>;
}
