import { isRouteErrorResponse, useNavigate } from "react-router";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "../primitives/Button";
import { CardPage } from "./CardPage";

/**
 * Default ErrorBoundary export for routes, so a failing view shows a calm
 * recovery card instead of collapsing to the root fallback.
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
        <CardPage
            title={heading}
            description={detail}
            actions={<>
                <Button variant="secondary" size="md" onClick={() => navigate("/", { replace: true })}>
                    <ArrowLeft size={14} aria-hidden="true" />
                    Go home
                </Button>
                <Button size="md" onClick={() => window.location.reload()}>
                    <RefreshCw size={14} aria-hidden="true" />
                    Reload
                </Button>
            </>}
        />
    );
}
