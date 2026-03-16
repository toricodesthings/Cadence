import { AuthCallback, AuthView } from "@neondatabase/auth/react/ui";
import { Link, useLocation, useNavigate } from "react-router";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useEffect, useState } from "react";
import { authClient } from "../lib/auth-client";
import { useAuthState } from "../hooks/auth/use-auth-state";
import { Button } from "../components/primitives/Button";
import {
    DESKTOP_AUTH_BRIDGE_PARAM,
    DESKTOP_AUTH_PROVIDER_PARAM,
    getAuthCallbackUrl,
    getDesktopAuthBrowserCallbackPath,
    getDesktopDeepLinkCallbackUrl,
    IS_DESKTOP_RUNTIME,
    normalizeRedirectTo,
    type SocialProvider,
} from "../platform/runtime";

function isSocialProvider(value: string | null): value is SocialProvider {
    return value === "google" || value === "github";
}

function getMergedCallbackParams(location: { search: string; hash: string }) {
    const params = new URLSearchParams(location.search);
    const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;

    if (hash.includes("=")) {
        const hashParams = new URLSearchParams(hash);
        hashParams.forEach((value, key) => {
            if (!params.has(key)) {
                params.set(key, value);
            }
        });
    }

    return params;
}

function CadenceAuthMark({ size = "h-14 w-14", rounded = "rounded-[1.4rem]" }: { size?: string; rounded?: string }) {
    return (
        <img src="/logo.png" alt="Cadence" className={`${size} ${rounded} object-cover`} />
    );
}

function DesktopBrowserSignInScreen({ provider, redirectTo }: { provider: SocialProvider; redirectTo: string }) {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        void authClient.signIn.social({
            provider,
            callbackURL: getDesktopAuthBrowserCallbackPath(redirectTo),
            fetchOptions: { throw: true },
        }).catch((error) => {
            if (!active) {
                return;
            }

            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Cadence could not start desktop sign-in from the browser bridge.",
            );
        });

        return () => {
            active = false;
        };
    }, [provider, redirectTo]);

    return (
        <main className="flex min-h-dvh items-center justify-center bg-twilight px-6">
            <div className="glass-surface w-full max-w-md rounded-[2rem] p-8 text-center shadow-2xl">
                <div className="mb-5 flex items-center justify-center">
                    <CadenceAuthMark size="h-10 w-10" rounded="rounded-2xl" />
                </div>
                <h1 className="font-display text-2xl font-semibold text-twilight-text">
                    {errorMessage ? "Desktop sign-in failed" : "Opening secure sign-in"}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-twilight-text-soft">
                    {errorMessage
                        ? errorMessage
                        : `Cadence is opening ${provider === "google" ? "Google" : "GitHub"} sign-in in your browser.`}
                </p>
            </div>
        </main>
    );
}

function DesktopBrowserCallbackBridgeScreen({ location }: { location: { search: string; hash: string } }) {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const params = getMergedCallbackParams(location);

        if (!params.has("neon_auth_session_verifier")) {
            setErrorMessage("The desktop callback bridge did not receive a session verifier.");
            return;
        }

        window.location.replace(getDesktopDeepLinkCallbackUrl(params));
    }, [location]);

    return (
        <main className="flex min-h-dvh items-center justify-center bg-twilight px-6">
            <div className="glass-surface w-full max-w-md rounded-[2rem] p-8 text-center shadow-2xl">
                <div className="mb-5 flex items-center justify-center">
                    <CadenceAuthMark size="h-10 w-10" rounded="rounded-2xl" />
                </div>
                <h1 className="font-display text-2xl font-semibold text-twilight-text">
                    {errorMessage ? "Desktop handoff failed" : "Returning to Cadence"}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-twilight-text-soft">
                    {errorMessage
                        ? errorMessage
                        : "Your browser is handing the completed sign-in back to the desktop app."}
                </p>
            </div>
        </main>
    );
}

function DesktopAuthCallbackScreen({ redirectTo }: { redirectTo: string }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { beginAuthRecovery } = useAuthState();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isRecovering, setIsRecovering] = useState(true);

    useEffect(() => {
        let active = true;

        const recoverSession = async () => {
            const params = new URLSearchParams(location.search);
            const hasVerifier = params.has("neon_auth_session_verifier");

            if (!hasVerifier) {
                if (import.meta.env.DEV) {
                    console.warn("[cadence:desktop-auth] callback missing session verifier", {
                        search: location.search,
                    });
                }

                setErrorMessage("The sign-in callback did not include a session verifier.");
                setIsRecovering(false);
                return;
            }

            try {
                if (import.meta.env.DEV) {
                    console.info("[cadence:desktop-auth] restoring session from callback", {
                        redirectTo,
                    });
                }

                const session = await authClient.getSession();
                if (!active) {
                    return;
                }

                if (!session?.data) {
                    const recovered = await beginAuthRecovery();
                    if (!active) {
                        return;
                    }

                    if (!recovered) {
                        setErrorMessage("Cadence could not restore your session after the OAuth callback.");
                        setIsRecovering(false);
                        return;
                    }
                }

                navigate(redirectTo, { replace: true });
            } catch (error) {
                if (!active) {
                    return;
                }

                if (import.meta.env.DEV) {
                    console.error("[cadence:desktop-auth] session restore failed", error);
                }

                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Cadence could not restore your session after the OAuth callback.",
                );
                setIsRecovering(false);
            }
        };

        void recoverSession();

        return () => {
            active = false;
        };
    }, [beginAuthRecovery, location.search, navigate, redirectTo]);

    return (
        <main className="flex min-h-dvh items-center justify-center bg-twilight px-6">
            <div className="glass-surface w-full max-w-md rounded-[2rem] p-8 text-center shadow-2xl">
                <div className="mb-5 flex items-center justify-center">
                    <CadenceAuthMark size="h-10 w-10" rounded="rounded-2xl" />
                </div>
                <h1 className="font-display text-2xl font-semibold text-twilight-text">
                    {errorMessage ? "Sign-in needs attention" : "Completing sign in"}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-twilight-text-soft">
                    {errorMessage
                        ? errorMessage
                        : "Cadence is restoring your desktop session and returning you to the app."}
                </p>
                <div className="mt-6 flex justify-center">
                    {errorMessage ? (
                        <Button
                            variant="secondary"
                            className="border-white/10 bg-white/5"
                            onClick={() => {
                                setErrorMessage(null);
                                setIsRecovering(true);
                                void beginAuthRecovery().then((recovered) => {
                                    if (recovered) {
                                        navigate(redirectTo, { replace: true });
                                        return;
                                    }

                                    setErrorMessage("Cadence still could not restore your session.");
                                    setIsRecovering(false);
                                });
                            }}
                        >
                            Retry sign-in
                        </Button>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-twilight-text-soft">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-lantern" />
                            {isRecovering ? "Restoring session..." : "Finishing up..."}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

export default function AuthPage() {
    const location = useLocation();
    const { pathname, state, search } = location;
    const searchParams = new URLSearchParams(search);
    const isSignUp = pathname === "/auth/sign-up";
    const isCallback = pathname === "/auth/callback";
    const isDesktopStart = pathname === "/auth/desktop-start";
    const isDesktopBrowserBridge = searchParams.get(DESKTOP_AUTH_BRIDGE_PARAM) === "1";
    const desktopProvider = searchParams.get(DESKTOP_AUTH_PROVIDER_PARAM);
    const redirectTo = normalizeRedirectTo(
        searchParams.get("redirectTo")
        ?? (typeof state === "object" && state && "from" in state ? String(state.from) : "/"),
    );

    useDocumentMeta(
        isCallback
            ? "Finishing Sign In · Cadence"
            : isDesktopStart
                ? "Redirecting to Sign In · Cadence"
            : `${isSignUp ? "Create Account" : "Sign In"} · Cadence`,
        isCallback
            ? "Completing your Cadence sign-in flow."
            : isDesktopStart
                ? "Redirecting your desktop sign-in to the selected provider."
            : isSignUp
                ? "Create your Cadence account and enter a calm workspace for tasks, habits, and weekly resets."
                : "Sign in to Cadence and return to your calm planning workspace.",
    );

    useEffect(() => {
        const wrapper = document.querySelector(".neon-auth-wrapper");
        if (!wrapper) return;

        const labelPasswordButtons = () => {
            const iconOnlyButtons = Array.from(wrapper.querySelectorAll<HTMLButtonElement>("button"))
                .filter((button) => !button.getAttribute("aria-label"))
                .filter((button) => button.querySelector("svg"))
                .filter((button) => !button.textContent?.trim());

            iconOnlyButtons.forEach((button, index) => {
                if (index === 0) {
                    button.setAttribute("aria-label", "Continue with Google");
                    return;
                }

                if (index === 1) {
                    button.setAttribute("aria-label", "Continue with GitHub");
                    return;
                }

                button.setAttribute("aria-label", "Toggle password visibility");
            });
        };

        labelPasswordButtons();

        const observer = new MutationObserver(labelPasswordButtons);
        observer.observe(wrapper, { childList: true, subtree: true, attributes: true });

        return () => observer.disconnect();
    }, [pathname]);

    if (!IS_DESKTOP_RUNTIME && isDesktopBrowserBridge && isSocialProvider(desktopProvider) && isDesktopStart) {
        return <DesktopBrowserSignInScreen provider={desktopProvider} redirectTo={redirectTo} />;
    }

    if (isCallback) {
        if (IS_DESKTOP_RUNTIME) {
            return <DesktopAuthCallbackScreen redirectTo={redirectTo} />;
        }

        if (isDesktopBrowserBridge) {
            return <DesktopBrowserCallbackBridgeScreen location={location} />;
        }

        return (
            <main className="flex min-h-dvh items-center justify-center bg-twilight px-6">
                <div className="glass-surface w-full max-w-md rounded-[2rem] p-8 text-center shadow-2xl">
                    <div className="mb-5 flex items-center justify-center">
                        <CadenceAuthMark size="h-10 w-10" rounded="rounded-2xl" />
                    </div>
                    <h1 className="font-display text-2xl font-semibold text-twilight-text">
                        Completing sign in
                    </h1>
                    <p className="mt-3 text-sm leading-relaxed text-twilight-text-soft">
                        Cadence is restoring your session and returning you to the app.
                    </p>
                    <div className="mt-6 flex justify-center">
                        <AuthCallback redirectTo={redirectTo} />
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="relative min-h-dvh overflow-hidden bg-twilight">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-[-12%] top-[8%] h-[24rem] w-[24rem] rounded-full bg-moonlit/10 blur-[120px]" />
                <div className="absolute right-[-8%] top-[18%] h-[26rem] w-[26rem] rounded-full bg-lantern/8 blur-[130px]" />
                <div className="absolute bottom-[-10%] left-1/2 h-[22rem] w-[34rem] -translate-x-1/2 rounded-full bg-white/[0.04] blur-[160px]" />
            </div>

            <section className="safe-top safe-bottom relative flex min-h-dvh items-start justify-center px-4 py-4 sm:px-6 sm:py-8 md:items-center">
                <div className="w-full max-w-lg">
                    <div className="glass-surface relative overflow-hidden rounded-[2.15rem] px-6 py-6 shadow-[0_36px_120px_rgba(0,0,0,0.38)] sm:px-7 sm:py-7">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <div className="mb-4 flex flex-col items-center text-center">
                            <CadenceAuthMark size="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]" rounded="rounded-[1.45rem]" />
                            <p className="mt-4 font-display text-[1.85rem] font-semibold leading-[1.02] text-twilight-text sm:text-[2.1rem]">
                                {isSignUp ? "Create your sanctuary." : "Step into your Cadence."}
                            </p>
                            <p className="mt-2.5 max-w-[22rem] text-sm leading-7 text-twilight-text-soft sm:text-[15px]">
                                {isSignUp
                                    ? "Create your account and start in a calmer rhythm."
                                    : "Settle in, capture what matters, and continue with clarity."}
                            </p>
                        </div>

                        <div className="neon-auth-wrapper">
                            <AuthView
                                view={isSignUp ? "SIGN_UP" : "SIGN_IN"}
                                callbackURL={getAuthCallbackUrl(redirectTo)}
                                redirectTo={redirectTo}
                                socialLayout="horizontal"
                                classNames={{
                                    base: "w-full max-w-none space-y-2.5",
                                    header: "hidden",
                                    title: "hidden",
                                    description: "hidden",
                                    continueWith: "text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft",
                                    separator: "text-[11px] uppercase tracking-[0.22em] text-twilight-text-soft",
                                    footer: "hidden",
                                    footerLink: "hidden",
                                    form: {
                                        button: "min-h-10 rounded-[1rem] text-sm font-medium",
                                        primaryButton: "min-h-10 rounded-[1rem] bg-lantern text-twilight-void font-semibold",
                                        providerButton: "min-h-10 rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 text-twilight-text",
                                        secondaryButton: "min-h-10 rounded-[1rem] border border-twilight-border-light bg-transparent text-twilight-text-soft",
                                        input: "min-h-10 rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 px-4 text-twilight-text",
                                        label: "text-sm font-medium text-twilight-text",
                                        description: "text-sm leading-relaxed text-twilight-text-soft",
                                        forgotPasswordLink: "inline-flex min-h-0 items-center py-0 text-sm font-medium leading-none text-lantern hover:text-lantern",
                                        error: "text-sm text-feedback-error",
                                    },
                                }}
                                localization={{
                                    SIGN_IN: "Step into your Cadence",
                                    SIGN_IN_DESCRIPTION: "",
                                    SIGN_IN_ACTION: "Enter Cadence",
                                    SIGN_UP: "Create your sanctuary",
                                    SIGN_UP_DESCRIPTION: "",
                                    SIGN_UP_ACTION: "Create account",
                                    OR_CONTINUE_WITH: "Or continue with",
                                    NAME_DESCRIPTION: "Choose the name that should greet you inside Cadence.",
                                    FORGOT_PASSWORD: "Forgot password?",
                                }}
                            />
                        </div>

                        <div className="mt-5 flex items-center justify-center gap-1.5 text-sm">
                            <span className="text-twilight-text-soft">
                                {isSignUp ? "Already have a room?" : "New here?"}
                            </span>
                            <Link
                                to={isSignUp ? "/auth/sign-in" : "/auth/sign-up"}
                                className="font-medium text-lantern hover:text-lantern/80 transition-colors"
                            >
                                {isSignUp ? "Sign in" : "Create an account"}
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
