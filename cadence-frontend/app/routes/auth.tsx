import { AuthView } from "@neondatabase/auth/react/ui";
import { useLocation } from "react-router";
import { Feather, Sparkles } from "lucide-react";

export default function AuthPage() {
    const { pathname } = useLocation();

    return (
        <div className="min-h-screen bg-twilight flex flex-col md:flex-row overflow-hidden">
            {/* ─── Left Atmospheric Panel ─── */}
            <div className="relative hidden md:flex flex-col justify-center p-14 lg:p-24 flex-1 overflow-hidden">
                {/* Glow Effects behind text */}
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-moonlit/5 blur-[120px] pointer-events-none" />
                <div className="absolute top-1/2 left-20 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-lantern/5 blur-[100px] pointer-events-none" />

                <div className="relative z-10 max-w-lg">
                    <div className="w-16 h-16 rounded-3xl bg-lantern/10 flex items-center justify-center glow-lantern mb-10">
                        <span className="text-lantern font-display font-bold text-2xl">C</span>
                    </div>

                    <h1 className="font-display text-4xl lg:text-5xl font-medium text-twilight-text leading-[1.15] tracking-tight mb-6">
                        A quiet space for your brightest thoughts.
                    </h1>

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
            <div className="flex-1 md:flex-none md:w-[500px] lg:w-[600px] p-6 lg:p-12 flex items-center justify-center relative">
                {/* Subtle right-side glow */}
                <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-lantern/5 blur-[100px] pointer-events-none" />

                <div className="w-full max-w-md relative z-10">
                    {/* Mobile Logo */}
                    <div className="md:hidden flex flex-col items-center mb-10">
                        <div className="w-12 h-12 rounded-2xl bg-lantern/10 flex items-center justify-center glow-lantern mb-4">
                            <span className="text-lantern font-display font-bold text-xl">C</span>
                        </div>
                        <h1 className="font-display text-2xl font-medium text-twilight-text">Cadence</h1>
                    </div>

                    <div className="glass-surface rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
                        {/* Top glass highlight */}
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                        <div className="mb-8">
                            <h2 className="font-display text-2xl font-medium text-twilight-text mb-2">Welcome</h2>
                            <p className="text-sm text-twilight-text-muted">Sign in or create an account to enter your sanctuary.</p>
                        </div>

                        {/* Auth component with forced dark theme wrapping styles */}
                        <div className="neon-auth-wrapper">
                            <AuthView view={pathname === "/auth/sign-up" ? "SIGN_UP" : "SIGN_IN"} />
                        </div>

                        <p className="text-center text-[11px] text-twilight-text-muted/90 mt-8">
                            By continuing, you agree to step away from the noise.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
