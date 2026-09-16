import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { StartupRenderContext, useWorkspaceStartup } from "../../hooks/core/use-workspace-startup";
import { isWorkspacePath } from "../../lib/auth/workspace-path";
import { Button } from "../primitives/Button";
import { Loading } from "../shared/Loading";

/** Lives above routes so startup completes once per signed-in account. */
export function WorkspaceStartup({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const { authReady, isAuthenticated } = useAuthState();
    const { pending, state, slow, retry, trackRender } = useWorkspaceStartup(
        authReady && isAuthenticated && isWorkspacePath(pathname),
    );
    const message = state === "offline"
        ? "You're offline. Connect to load this workspace."
        : state === "error"
            ? "We couldn't load your workspace. Please try again."
            : slow ? "Your workspace is taking longer than usual to load." : null;

    return (
        <StartupRenderContext value={trackRender}>
            <div inert={pending} aria-hidden={pending || undefined} style={pending ? { visibility: "hidden" } : undefined}>
                {children}
            </div>
            {pending && (
                <Loading title="Preparing your workspace">
                    {message && <p role="status" className="mt-6 max-w-sm px-4 text-sm text-twilight-text-soft">{message}</p>}
                    {(state === "error" || state === "offline") && (
                        <Button variant="secondary" className="mt-4" onClick={retry}>Try again</Button>
                    )}
                    {slow && state !== "error" && state !== "offline" && (
                        <Button variant="secondary" className="mt-4" onClick={() => window.location.reload()}>Reload</Button>
                    )}
                </Loading>
            )}
        </StartupRenderContext>
    );
}
