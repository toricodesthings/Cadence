import { AuthCallback, AuthView } from "@neondatabase/auth/react/ui";
import { Link, useLocation, useNavigate } from "react-router";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useEffect, useRef, useState } from "react";
import { authClient } from "../lib/auth-client";
import {
    DESKTOP_OAUTH_PAYLOAD_PARAM,
    deserializeDesktopAuthPayload,
    writeDesktopAuthSession,
} from "../lib/desktop-auth-session";
import { useAuthState } from "../hooks/auth/use-auth-state";
import { Button } from "../components/primitives/Button";
import { Input } from "../components/primitives/Input";
import {
    consumeDesktopAuthHandoff,
    DESKTOP_AUTH_STATE_PARAM,
} from "../platform/desktop-auth-handoff";
import {
    beginSocialSignIn,
    getAuthCallbackUrl,
    IS_DESKTOP_RUNTIME,
    normalizeRedirectTo,
} from "../platform/runtime";

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

function ProviderLogo({ provider }: { provider: "google" | "github" }) {
    if (provider === "google") {
        return (
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 5.16-4.53z"
                />
            </svg>
        );
    }

    return (
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
    );
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === "string" && message ? message : fallback;
}

function DesktopAuthCallbackScreen({ redirectTo, location }: { redirectTo: string; location: { search: string; hash: string } }) {
    const navigate = useNavigate();
    const { beginAuthRecovery, isAuthenticated } = useAuthState();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        void (async () => {
            const callbackParams = getMergedCallbackParams(location);
            const authState = callbackParams.get(DESKTOP_AUTH_STATE_PARAM);
            const verifier = callbackParams.get("neon_auth_session_verifier");
            const payload = callbackParams.get(DESKTOP_OAUTH_PAYLOAD_PARAM);

            if (!authState) {
                if (active) {
                    setErrorMessage("The sign-in callback did not include a valid desktop auth state.");
                }
                return;
            }

            const validHandoff = await consumeDesktopAuthHandoff(authState, redirectTo);
            if (!validHandoff) {
                if (active) {
                    setErrorMessage("This sign-in callback is stale, invalid, or has already been used.");
                }
                return;
            }

            if (verifier) {
                try {
                    const recovered = await beginAuthRecovery();

                    if (!active) {
                        return;
                    }

                    if (!recovered) {
                        setErrorMessage("Cadence could not restore your session after the OAuth callback.");
                        return;
                    }

                    navigate(redirectTo, { replace: true });
                    return;
                } catch (error) {
                    if (active) {
                        if (import.meta.env.DEV) {
                            console.error("[cadence:oauth-callback] verifier recovery failed", {
                                search: location.search,
                                error,
                            });
                        }

                        setErrorMessage(getErrorMessage(error, "Cadence could not restore your session after the OAuth callback."));
                    }
                    return;
                }
            }

            if (!payload) {
                if (active) {
                    setErrorMessage("The sign-in callback did not include an OAuth verifier or desktop session payload.");
                }
                return;
            }

            try {
                const desktopSession = deserializeDesktopAuthPayload(payload);

                if (!active) {
                    return;
                }

                if (!desktopSession) {
                    setErrorMessage("Cadence could not restore your session after the OAuth callback.");
                    return;
                }

                try {
                    await writeDesktopAuthSession(desktopSession);
                } catch (error) {
                    if (import.meta.env.DEV) {
                        console.warn("[cadence:oauth-callback] desktop session persistence failed; continuing with live auth session", error);
                    }
                }

                navigate(redirectTo, { replace: true });
            } catch (error) {
                if (active) {
                    if (import.meta.env.DEV) {
                        console.error("[cadence:oauth-callback] verifier exchange failed", {
                            search: location.search,
                            error,
                        });
                    }
                    setErrorMessage(getErrorMessage(error, "Cadence could not restore your session after the OAuth callback."));
                }
            }
        })();

        return () => {
            active = false;
        };
    }, [beginAuthRecovery, location, navigate, redirectTo]);

    useEffect(() => {
        if (isAuthenticated) {
            navigate(redirectTo, { replace: true });
        }
    }, [isAuthenticated, navigate, redirectTo]);

    return (
        <main className="flex min-h-dvh items-center justify-center bg-twilight px-6">
            <div className="glass-surface w-full max-w-md rounded-[2rem] p-8 text-center shadow-2xl">
                <div className="mb-5 flex items-center justify-center">
                    <CadenceAuthMark size="h-10 w-10" rounded="rounded-2xl" />
                </div>
                <h1 className="font-display text-2xl font-semibold text-twilight-text">
                    {errorMessage ? "Sign-in failed" : "Completing sign in"}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-twilight-text-soft">
                    {errorMessage
                        ? errorMessage
                        : "Cadence is restoring your session and returning you to the app."}
                </p>
                {errorMessage && (
                    <div className="mt-6 flex justify-center">
                        <Button variant="secondary" size="md" onClick={() => navigate("/auth/sign-in", { replace: true })}>
                            Back to sign in
                        </Button>
                    </div>
                )}
            </div>
        </main>
    );
}

function DesktopAuthForm({ isSignUp, redirectTo }: { isSignUp: boolean; redirectTo: string }) {
    const navigate = useNavigate();
    const { beginAuthRecovery } = useAuthState();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

    const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage(null);
        setInfoMessage(null);
        setIsSubmitting(true);

        try {
            if (isSignUp) {
                const result = await authClient.signUp.email({
                    name: name.trim(),
                    email: email.trim(),
                    password,
                    callbackURL: redirectTo,
                    fetchOptions: { throw: true },
                });

                if (!result?.token) {
                    setInfoMessage("Your account was created. Continue with sign in to enter Cadence.");
                    navigate("/auth/sign-in", { replace: true, state: { from: redirectTo } });
                    return;
                }
            } else {
                const result = await authClient.signIn.email({
                    email: email.trim(),
                    password,
                    callbackURL: redirectTo,
                    fetchOptions: { throw: true },
                });
            }

            const recovered = await beginAuthRecovery();
            if (!recovered) {
                setErrorMessage("Cadence could not establish your session after sign-in.");
                return;
            }

            navigate(redirectTo, { replace: true });
        } catch (error) {
            console.error("[cadence:email-auth] error:", error);
            setErrorMessage(getErrorMessage(error, isSignUp
                ? "Cadence could not create your account."
                : "Cadence could not sign you in."));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSocialAuth = async (provider: "google" | "github") => {
        setErrorMessage(null);
        setInfoMessage(null);
        setIsSubmitting(true);

        try {
            await beginSocialSignIn(provider, getAuthCallbackUrl(redirectTo));
        } catch (error) {
            setErrorMessage(getErrorMessage(error, `Cadence could not start ${provider} sign-in.`));
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <form className="space-y-3" onSubmit={handleEmailAuth}>
                {isSignUp && (
                    <div className="space-y-1.5 text-left">
                        <label htmlFor="desktop-auth-name" className="text-sm font-medium text-twilight-text">
                            Name
                        </label>
                        <Input
                            id="desktop-auth-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            autoComplete="name"
                            placeholder="The name Cadence will greet"
                            required
                            className="min-h-10 rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 px-4 text-twilight-text"
                        />
                    </div>
                )}

                <div className="space-y-1.5 text-left">
                    <label htmlFor="desktop-auth-email" className="text-sm font-medium text-twilight-text">
                        Email
                    </label>
                    <Input
                        id="desktop-auth-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        placeholder="you@example.com"
                        required
                        className="min-h-10 rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 px-4 text-twilight-text"
                    />
                </div>

                <div className="space-y-1.5 text-left">
                    <label htmlFor="desktop-auth-password" className="text-sm font-medium text-twilight-text">
                        Password
                    </label>
                    <Input
                        id="desktop-auth-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        placeholder={isSignUp ? "Create a password" : "Enter your password"}
                        required
                        className="min-h-10 rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 px-4 text-twilight-text"
                    />
                </div>

                {errorMessage && (
                    <p className="text-left text-sm text-feedback-error">{errorMessage}</p>
                )}

                {infoMessage && (
                    <p className="text-left text-sm text-twilight-text-soft">{infoMessage}</p>
                )}

                <Button
                    type="submit"
                    size="md"
                    className="min-h-10 w-full rounded-[1rem] bg-lantern text-twilight-void font-semibold"
                    disabled={isSubmitting}
                >
                    {isSubmitting
                        ? (isSignUp ? "Creating account..." : "Signing in...")
                        : (isSignUp ? "Create account" : "Sign in")}
                </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft">
                <div className="h-px flex-1 bg-twilight-border-light" />
                <span>Or continue with</span>
                <div className="h-px flex-1 bg-twilight-border-light" />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button
                    type="button"
                    aria-label="Continue with Google"
                    disabled={isSubmitting}
                    onClick={() => void handleSocialAuth("google")}
                    className="flex h-14 w-full items-center justify-center rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 text-twilight-text transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <ProviderLogo provider="google" />
                </button>
                <button
                    type="button"
                    aria-label="Continue with GitHub"
                    disabled={isSubmitting}
                    onClick={() => void handleSocialAuth("github")}
                    className="flex h-14 w-full items-center justify-center rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 text-twilight-text transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <ProviderLogo provider="github" />
                </button>
            </div>
        </>
    );
}

// Removed DesktopAuthCallbackScreen to utilize generic AuthCallback

export default function AuthPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { authReady, isAuthenticated } = useAuthState();
    const { pathname, state, search } = location;
    const searchParams = new URLSearchParams(search);
    const isSignUp = pathname === "/auth/sign-up";
    const isCallback = pathname === "/auth/callback";
    const redirectTo = normalizeRedirectTo(
        searchParams.get("redirectTo")
        ?? (typeof state === "object" && state && "from" in state ? String(state.from) : "/"),
    );

    useDocumentMeta(
        isCallback
            ? "Finishing Sign In · Cadence"
            : `${isSignUp ? "Create Account" : "Sign In"} · Cadence`,
        isCallback
            ? "Completing your Cadence sign-in flow."
            : isSignUp
                ? "Create your Cadence account and enter a calm workspace for tasks, habits, and weekly resets."
                : "Sign in to Cadence and return to your calm planning workspace.",
    );

    useEffect(() => {
        if (!authReady || !isAuthenticated) {
            return;
        }

        navigate(redirectTo, { replace: true });
    }, [authReady, isAuthenticated, navigate, redirectTo]);

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

    if (isCallback) {
        if (IS_DESKTOP_RUNTIME) {
            return <DesktopAuthCallbackScreen redirectTo={redirectTo} location={location} />;
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
            <div className="pointer-events-none absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")' }} />
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
                                {isSignUp ? "Create your account" : "Sign in to Cadence"}
                            </p>
                            <p className="mt-2.5 max-w-[22rem] text-sm leading-7 text-twilight-text-soft sm:text-[15px]">
                                {isSignUp
                                    ? "Set up your workspace and start planning."
                                    : "Pick up where you left off."}
                            </p>
                        </div>

                        <div className="neon-auth-wrapper">
                            {IS_DESKTOP_RUNTIME ? (
                                <DesktopAuthForm isSignUp={isSignUp} redirectTo={redirectTo} />
                            ) : (
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
                                        SIGN_IN: "Sign in to Cadence",
                                        SIGN_IN_DESCRIPTION: "",
                                        SIGN_IN_ACTION: "Sign in",
                                        SIGN_UP: "Create your account",
                                        SIGN_UP_DESCRIPTION: "",
                                        SIGN_UP_ACTION: "Create account",
                                        OR_CONTINUE_WITH: "Or continue with",
                                        NAME_DESCRIPTION: "The name that greets you inside Cadence.",
                                        FORGOT_PASSWORD: "Forgot password?",
                                    }}
                                />
                            )}
                        </div>

                        <div className="mt-5 flex flex-col items-center justify-center gap-4 text-sm">
                            <div className="flex items-center gap-1.5">
                                <span className="text-twilight-text-soft">
                                    {isSignUp ? "Already have an account?" : "Don't have an account?"}
                                </span>
                                <Link
                                    to={isSignUp ? "/auth/sign-in" : "/auth/sign-up"}
                                    className="font-medium text-lantern transition-colors hover:text-lantern/80"
                                >
                                    {isSignUp ? "Sign in" : "Create an account"}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
