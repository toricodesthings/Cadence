import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Loader2, TriangleAlert } from "lucide-react";
import type { McpScope } from "@cadence/contracts/connections";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { Button } from "../components/primitives/Button";
import { Switch } from "../components/primitives/Switch";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useAuthState } from "../hooks/auth/use-auth-state";
import { useAnswerConnectRequest, useConnectRequest } from "../hooks/core/use-connections";
import { MCP_SCOPE_COPY } from "../lib/constants/mcp";

/**
 * Consent for an outside assistant (MCP). The assistant sent the browser here from
 * the MCP origin with `?request=`; this page needs a signed-in account, shows who is
 * asking and what they'd get, then sends the browser back to the MCP origin.
 */
export default function ConnectRoute() {
    useDocumentMeta("Connect an assistant · Cadence", "Let an assistant you use read or add to your Cadence.");
    const { search, pathname } = useLocation();
    const navigate = useNavigate();
    const { authReady, isAuthenticated, session } = useAuthState();
    const request = new URLSearchParams(search).get("request");

    useEffect(() => {
        if (authReady && !isAuthenticated) {
            navigate(`/auth/sign-in?redirectTo=${encodeURIComponent(pathname + search)}`, { replace: true });
        }
    }, [authReady, isAuthenticated, navigate, pathname, search]);

    const view = useConnectRequest(request);
    const answer = useAnswerConnectRequest(request ?? "");
    const [scopes, setScopes] = useState<Set<McpScope> | null>(null);
    const chosen = scopes ?? new Set(view.data?.scopes ?? []);
    const leaving = answer.isPending || answer.isSuccess;

    const respond = (approve: boolean) =>
        answer.mutate(approve ? { scopes: [...chosen] } : null, {
            onSuccess: (redirectTo) => window.location.assign(redirectTo),
        });

    let body: React.ReactNode;
    if (!authReady || !isAuthenticated || (request && view.isPending)) {
        body = <Loader2 className="mx-auto animate-spin text-twilight-text-soft" aria-label="Loading" />;
    } else if (!request || view.isError || !view.data) {
        body = (
            <p className="text-center text-sm leading-7 text-twilight-text-soft">
                This request expired or was already answered. Start connecting again from your assistant.
            </p>
        );
    } else {
        const client = view.data;
        body = (
            <div className="flex flex-col gap-5">
                <div className="text-center">
                    <h1 className="font-display text-[1.6rem] font-semibold leading-tight text-twilight-text">
                        Allow {client.clientName} to use your Cadence?
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-twilight-text-soft">
                        {client.publisher
                            ? <>Published by <strong className="text-twilight-text">{client.publisher}</strong>. </>
                            : "This app named itself; its name isn't verified. "}
                        Access goes to <strong className="text-twilight-text">{client.redirectHost}</strong>.
                    </p>
                    {session?.user?.email && (
                        <p className="mt-1 text-xs text-twilight-text-muted">Signed in as {session.user.email}</p>
                    )}
                </div>

                {client.localRedirect && (
                    <p className="flex gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-sm leading-6 text-twilight-text">
                        <TriangleAlert size={16} className="mt-1 shrink-0 text-amber-300" aria-hidden />
                        This sends access to an app on this computer. Continue only if you just started connecting from it.
                    </p>
                )}

                <div className="flex flex-col gap-2">
                    {(Object.keys(MCP_SCOPE_COPY) as McpScope[]).map((scope) => (
                        <label key={scope} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                            <span>
                                <span className="block text-sm font-medium text-twilight-text">{MCP_SCOPE_COPY[scope].title}</span>
                                <span className="block text-xs leading-5 text-twilight-text-soft">{MCP_SCOPE_COPY[scope].description}</span>
                            </span>
                            <Switch
                                checked={chosen.has(scope)}
                                disabled={leaving}
                                onCheckedChange={(on) => {
                                    const next = new Set(chosen);
                                    if (on) next.add(scope);
                                    else next.delete(scope);
                                    setScopes(next);
                                }}
                            />
                        </label>
                    ))}
                </div>

                <p className="text-xs leading-5 text-twilight-text-muted">
                    Disconnect anytime in Settings › Integrations. That stops new access; it can't take back what the
                    assistant already read. It can never delete anything or change your settings.
                </p>

                {answer.isError && (
                    <p role="alert" className="text-sm text-red-300">That didn't go through. Try again.</p>
                )}

                <div className="flex gap-3">
                    <Button variant="ghost" size="md" className="flex-1" disabled={leaving} onClick={() => respond(false)}>
                        Deny
                    </Button>
                    <Button size="md" className="flex-1" disabled={leaving || chosen.size === 0} onClick={() => respond(true)}>
                        {leaving ? <Loader2 size={16} className="animate-spin" aria-label="Connecting" /> : "Allow"}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <main className="relative flex min-h-dvh items-start justify-center bg-twilight px-4 py-8 safe-top safe-bottom md:items-center">
            <div className="glass-surface w-full max-w-md rounded-[2rem] px-6 py-7 shadow-[0_36px_120px_rgba(0,0,0,0.38)]">
                <img src="/logo.png" alt="Cadence" className="mx-auto mb-5 h-12 w-12 rounded-[1rem] object-cover" />
                {body}
            </div>
        </main>
    );
}
