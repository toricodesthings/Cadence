import { AuthView } from "@neondatabase/auth/react/ui";
import { Link, useLocation } from "react-router";
import { Feather, Sparkles } from "lucide-react";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useEffect } from "react";

export default function AuthPage() {
    const { pathname } = useLocation();
    const isSignUp = pathname === "/auth/sign-up";

    useDocumentMeta(
        `${isSignUp ? "Create Account" : "Sign In"} · Cadence`,
        isSignUp
            ? "Create your Cadence account and enter a calm workspace for tasks, habits, and weekly resets."
            : "Sign in to Cadence and return to your calm planning workspace.",
    );

    useEffect(() => {
        const wrapper = document.querySelector(".neon-auth-wrapper");
        if (!wrapper) return;

        const labelPasswordButtons = () => {
            wrapper.querySelectorAll<HTMLButtonElement>('button[type="button"]').forEach((button) => {
                if (button.getAttribute("aria-label")) return;
                if (!button.querySelector("svg")) return;
                button.setAttribute("aria-label", "Toggle password visibility");
            });
        };

        labelPasswordButtons();

        const observer = new MutationObserver(labelPasswordButtons);
        observer.observe(wrapper, { childList: true, subtree: true, attributes: true });

        return () => observer.disconnect();
    }, [pathname]);

    return (
        <main className="min-h-dvh bg-twilight">
        <div className="min-h-dvh flex flex-col overflow-hidden md:flex-row">
            {/* ─── Left Atmospheric Panel ─── */}
            <div className="relative hidden md:flex flex-col justify-center p-14 lg:p-24 flex-1 overflow-hidden">
                {/* Glow Effects behind text */}
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-moonlit/5 blur-[120px] pointer-events-none" />
                <div className="absolute top-1/2 left-20 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-lantern/5 blur-[100px] pointer-events-none" />

                <div className="relative z-10 max-w-lg">
                    <div className="w-16 h-16 rounded-3xl bg-lantern/10 flex items-center justify-center glow-lantern mb-10">
                        <span className="text-lantern font-display font-bold text-2xl">C</span>
                    </div>

                    <p className="font-display text-4xl lg:text-5xl font-medium text-twilight-text leading-[1.15] tracking-tight mb-6">
                        A quiet space for your brightest thoughts.
                    </p>

                    <p className="text-lg text-twilight-text-muted leading-relaxed mb-12 max-w-md">
                        Cadence is a digital sanctuary. Uncluttered, peaceful, and designed to help you organize your life without adding noise to it.
                    </p>

                    <div className="flex flex-col gap-6">
                        <div className="flex items-start gap-4">
                            <div className="w-9 h-9 rounded-xl bg-twilight-surface flex items-center justify-center shrink-0 border border-twilight-border-light">
                                <Feather size={16} className="text-lantern" />
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-twilight-text mb-1">Lightweight Capture</h3>
                                <p className="text-sm text-twilight-text-muted leading-relaxed">Offload your thoughts instantly before they disappear.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="w-9 h-9 rounded-xl bg-twilight-surface flex items-center justify-center shrink-0 border border-twilight-border-light">
                                <Sparkles size={16} className="text-moonlit" />
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-twilight-text mb-1">Peaceful Interface</h3>
                                <p className="text-sm text-twilight-text-muted leading-relaxed">No aggressive metrics or red alerts. Just calm clarity.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Right Auth Panel ─── */}
            <section className="safe-top safe-bottom relative flex flex-1 items-start justify-center overflow-y-auto px-4 py-6 sm:px-6 md:flex-none md:w-[500px] md:px-8 md:py-10 lg:w-[600px] lg:px-12">
                {/* Subtle right-side glow */}
                <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-lantern/5 blur-[100px] pointer-events-none" />

                <div className="relative z-10 w-full max-w-md">
                    {/* Mobile Logo */}
                    <div className="mb-8 flex flex-col items-center md:hidden">
                        <div className="w-12 h-12 rounded-2xl bg-lantern/10 flex items-center justify-center glow-lantern mb-4">
                            <span className="text-lantern font-display font-bold text-xl">C</span>
                        </div>
                        <p className="font-display text-2xl font-medium text-twilight-text">Cadence</p>
                    </div>

                    <div className="glass-surface relative overflow-hidden rounded-[2rem] p-6 shadow-2xl sm:p-8">
                        {/* Top glass highlight */}
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                        <div className="mb-5 flex items-center gap-4">
                            <div className="hidden md:flex w-11 h-11 rounded-2xl bg-lantern/10 items-center justify-center shrink-0 glow-lantern">
                                <span className="text-lantern font-display font-bold text-lg">C</span>
                            </div>
                            <h1 className="font-display text-[1.6rem] font-semibold leading-tight text-twilight-text">
                                {isSignUp ? "Create your sanctuary." : "Step into your Cadence."}
                            </h1>
                        </div>

                        {/* Auth component with forced dark theme wrapping styles */}
                        <div className="neon-auth-wrapper">
                            <AuthView
                                view={isSignUp ? "SIGN_UP" : "SIGN_IN"}
                                socialLayout="horizontal"
                                classNames={{
                                    base: "space-y-4",
                                    header: "hidden",
                                    title: "hidden",
                                    description: "hidden",
                                    continueWith: "text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft",
                                    separator: "text-[11px] uppercase tracking-[0.22em] text-twilight-text-soft",
                                    footer: "hidden",
                                    footerLink: "hidden",
                                    form: {
                                        button: "min-h-11 rounded-[1.1rem] text-sm font-medium",
                                        primaryButton: "min-h-11 rounded-[1.1rem] bg-lantern text-twilight-void font-semibold",
                                        providerButton: "min-h-11 rounded-[1.1rem] border border-twilight-border-light bg-twilight-surface/40 text-twilight-text",
                                        secondaryButton: "min-h-11 rounded-[1.1rem] border border-twilight-border-light bg-transparent text-twilight-text-soft",
                                        input: "min-h-11 rounded-[1.1rem] border border-twilight-border-light bg-twilight-surface/40 px-4 text-twilight-text",
                                        label: "text-sm font-medium text-twilight-text",
                                        description: "text-sm leading-relaxed text-twilight-text-soft",
                                        forgotPasswordLink: "text-sm font-medium text-lantern hover:text-lantern",
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
        </div>
        </main>
    );
}
