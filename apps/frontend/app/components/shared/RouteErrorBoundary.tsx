import { isRouteErrorResponse, useNavigate } from "react-router";
import { RefreshCw, ArrowLeft } from "lucide-react";

/**
 * Route-level error boundary that preserves the shell context.
 * Use this as the default ErrorBoundary export on authenticated routes
 * so failures stay contained instead of collapsing to the root fallback.
 */
export function RouteErrorBoundary({ error }: { error: unknown }) {
    const navigate = useNavigate();

    let heading = "Something went wrong";
    let detail = "This view couldn't load. Your other workspaces are still here.";

    if (isRouteErrorResponse(error)) {
        if (error.status === 404) {
            heading = "Not found";
            detail = "This page doesn't exist in your workspace.";
        } else {
            heading = `Error ${error.status}`;
            if (error.statusText) detail = error.statusText;
        }
    }

    return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
            <div className="w-full max-w-md space-y-5 rounded-2xl border border-twilight-border bg-twilight-surface/50 p-8 backdrop-blur-xl">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-twilight-text">
                    {heading}
                </h2>
                <p className="text-sm leading-relaxed text-twilight-text-muted">
                    {detail}
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-accent-primary/12 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20"
                    >
                        <RefreshCw size={14} aria-hidden="true" />
                        Reload
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate("/", { replace: true })}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-twilight-border px-4 py-2 text-sm text-twilight-text-soft transition-colors hover:bg-white/[0.04]"
                    >
                        <ArrowLeft size={14} aria-hidden="true" />
                        Go home
                    </button>
                </div>
            </div>
        </div>
    );
}
