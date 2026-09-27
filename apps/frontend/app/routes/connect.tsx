import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { McpScope } from "@cadence/contracts/connections";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { Button } from "../components/primitives/Button";
import { Switch } from "../components/primitives/Switch";
import { CardPage, EASE, rise, stagger } from "../components/shared/CardPage";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useAuthState } from "../hooks/auth/use-auth-state";
import { useAnswerConnectRequest, useConnectRequest } from "../hooks/core/use-connections";
import { useReducedMotionSetting } from "../hooks/ui/use-reduced-motion";
import { MCP_SCOPE_COPY } from "../lib/constants/mcp";

/** How long the drawn check stays up before the browser returns to the assistant. */
const SUCCESS_HOLD_MS = 1500;

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
    const reduced = useReducedMotionSetting();
    const request = new URLSearchParams(search).get("request");

    useEffect(() => {
        if (authReady && !isAuthenticated) {
            navigate(`/auth/sign-in?redirectTo=${encodeURIComponent(pathname + search)}`, { replace: true });
        }
    }, [authReady, isAuthenticated, navigate, pathname, search]);

    const view = useConnectRequest(request);
    const answer = useAnswerConnectRequest(request ?? "");
    const [scopes, setScopes] = useState<Set<McpScope> | null>(null);
    const [approved, setApproved] = useState(false);
    const chosen = scopes ?? new Set(view.data?.scopes ?? []);
    const leaving = answer.isPending || answer.isSuccess;

    const respond = (approve: boolean) =>
        answer.mutate(approve ? { scopes: [...chosen] } : null, {
            onSuccess: (redirectTo) => {
                if (!approve) return window.location.assign(redirectTo);
                setApproved(true);
                window.setTimeout(() => window.location.assign(redirectTo), reduced ? 400 : SUCCESS_HOLD_MS);
            },
        });

    let key: string;
    let body: React.ReactNode;
    if (!authReady || !isAuthenticated || (request && view.isPending)) {
        key = "loading";
        body = (
            <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-twilight-text-soft" aria-label="Loading" />
            </div>
        );
    } else if (!request || view.isError || !view.data) {
        key = "expired";
        body = (
            <motion.div variants={rise} className="py-4 text-center">
                <h1 className="font-display text-xl font-semibold text-twilight-text">This link has expired</h1>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-twilight-text-soft">
                    It was already answered or sat too long. Start connecting again from your assistant.
                </p>
            </motion.div>
        );
    } else if (approved) {
        key = "done";
        body = <Connected clientName={view.data.clientName} />;
    } else {
        const client = view.data;
        key = "ask";
        body = (
            <>
                <motion.header variants={rise} className="text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-primary/80">
                        Connect an assistant
                    </p>
                    <h1 className="mt-1.5 font-display text-[1.45rem] font-semibold leading-tight tracking-tight text-twilight-text text-balance">
                        Allow <span className="text-accent-primary">{client.clientName}</span> to use your Cadence?
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-twilight-text-soft text-pretty">
                        {client.publisher
                            ? <>Published by <strong className="font-medium text-twilight-text">{client.publisher}</strong>. </>
                            : "This app named itself, so its name isn't verified. "}
                        Access goes to <strong className="font-medium text-twilight-text">{client.redirectHost}</strong>.
                    </p>
                    {session?.user?.email && (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-xs text-twilight-text-muted">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" aria-hidden />
                            Signed in as {session.user.email}
                        </p>
                    )}
                </motion.header>

                {client.localRedirect && (
                    <motion.p
                        variants={rise}
                        className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs leading-5 text-twilight-text"
                    >
                        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
                        Access goes to an app on this computer. Continue only if you just started connecting from it.
                    </motion.p>
                )}

                <motion.fieldset variants={rise} className="flex flex-col gap-2">
                    <legend className="mb-1.5 text-xs font-medium text-twilight-text-muted">It would be able to</legend>
                    {(Object.keys(MCP_SCOPE_COPY) as McpScope[]).map((scope) => {
                        const on = chosen.has(scope);
                        return (
                            <label
                                key={scope}
                                className={`flex cursor-pointer items-center justify-between gap-4 rounded-2xl border py-1.5 pl-4 pr-2 transition-colors duration-300 ${on
                                    ? "border-accent-primary/25 bg-accent-primary/[0.06]"
                                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                                    }`}
                            >
                                <span>
                                    <span className="block text-sm font-medium text-twilight-text">{MCP_SCOPE_COPY[scope].title}</span>
                                    <span className="block text-xs leading-5 text-twilight-text-soft">{MCP_SCOPE_COPY[scope].description}</span>
                                </span>
                                <Switch
                                    checked={on}
                                    disabled={leaving}
                                    onCheckedChange={(next) => {
                                        const set = new Set(chosen);
                                        if (next) set.add(scope);
                                        else set.delete(scope);
                                        setScopes(set);
                                    }}
                                />
                            </label>
                        );
                    })}
                </motion.fieldset>

                <motion.p variants={rise} className="flex gap-2.5 text-xs leading-5 text-twilight-text-muted">
                    <ShieldCheck size={14} className="mt-px shrink-0 text-twilight-text-soft" aria-hidden />
                    <span>
                        It can't delete anything or change your settings. Disconnect anytime in Settings › Integrations;
                        that stops new access, not what it already read.
                    </span>
                </motion.p>

                {answer.isError && (
                    <p role="alert" className="text-center text-sm text-red-300">That didn't go through. Try again.</p>
                )}

                <motion.div variants={rise} className="flex gap-3">
                    <Button variant="secondary" size="md" className="flex-1" disabled={leaving} onClick={() => respond(false)}>
                        Deny
                    </Button>
                    <Button size="md" className="flex-1" disabled={leaving || chosen.size === 0} onClick={() => respond(true)}>
                        {leaving ? <Loader2 size={16} className="animate-spin" aria-label="Connecting" /> : "Allow"}
                    </Button>
                </motion.div>
            </>
        );
    }

    return (
        <CardPage>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={key}
                    variants={stagger}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                    className="flex flex-col gap-4"
                >
                    {body}
                </motion.div>
            </AnimatePresence>
        </CardPage>
    );
}

/** Approved: a ring and check draw themselves, then the page hands back to the assistant. */
function Connected({ clientName }: { clientName: string }) {
    return (
        <div className="flex flex-col items-center py-4 text-center" role="status">
            <motion.div
                variants={{ hidden: { scale: 0.85, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { duration: 0.45, ease: EASE } } }}
                className="grid h-20 w-20 place-items-center rounded-full bg-accent-primary/10 text-accent-primary shadow-[0_0_48px_color-mix(in_srgb,var(--accent-primary)_28%,transparent)]"
            >
                <svg viewBox="0 0 52 52" className="h-20 w-20" fill="none" aria-hidden>
                    <motion.circle
                        cx="26" cy="26" r="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        style={{ rotate: -90, transformOrigin: "center" }}
                        variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { duration: 0.6, ease: EASE } } }}
                    />
                    <motion.path
                        d="M16 27l7 7 13-15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                        variants={{ hidden: { pathLength: 0, opacity: 0 }, show: { pathLength: 1, opacity: 1, transition: { delay: 0.45, duration: 0.4, ease: EASE } } }}
                    />
                </svg>
            </motion.div>
            <motion.h1 variants={rise} className="mt-5 font-display text-2xl font-semibold tracking-tight text-twilight-text">
                Connected
            </motion.h1>
            <motion.p variants={rise} className="mt-1.5 text-sm text-twilight-text-soft">
                Taking you back to {clientName}…
            </motion.p>
        </div>
    );
}
