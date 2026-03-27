import type { LoadingMode } from "../Loading";

export function LoadingForeground({ mode }: { mode: LoadingMode }) {
    const isDaylight = mode === "daylight";

    return (
        <div className="relative z-10 flex flex-col items-center text-center mt-20">
            <div className="mb-10 relative flex items-center justify-center">
                {/* Deep Atmospheric Core Glow — accent-responsive */}
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 animate-pulse mix-blend-screen pointer-events-none"
                    style={{
                        background: isDaylight
                            ? "radial-gradient(circle, color-mix(in srgb, var(--accent-primary) 10%, transparent) 0%, color-mix(in srgb, var(--accent-primary) 3%, transparent) 40%, transparent 70%)"
                            : "radial-gradient(circle, color-mix(in srgb, var(--accent-primary) 15%, transparent) 0%, color-mix(in srgb, var(--accent-primary) 5%, transparent) 40%, transparent 70%)",
                        animationDuration: "4s",
                    }}
                />

                {/* Rotating Aura */}
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 animate-spin pointer-events-none"
                    style={{
                        animationDuration: "12s",
                        opacity: isDaylight ? 0.35 : 0.6,
                        mixBlendMode: isDaylight ? "multiply" : "screen",
                    }}
                >
                    <div
                        className="absolute inset-0 rounded-full blur-[6px]"
                        style={{
                            background:
                                "conic-gradient(from 0deg, transparent 0%, color-mix(in srgb, var(--accent-primary) 15%, transparent) 25%, transparent 50%, color-mix(in srgb, var(--accent-primary) 10%, transparent) 75%, transparent 100%)",
                        }}
                    />
                </div>

                {/* Inner glow */}
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 animate-pulse pointer-events-none"
                    style={{
                        background:
                            "radial-gradient(circle, color-mix(in srgb, var(--accent-primary) 20%, transparent) 0%, transparent 70%)",
                        animationDuration: "2.5s",
                        mixBlendMode: isDaylight ? "multiply" : "screen",
                        opacity: isDaylight ? 0.4 : 1,
                    }}
                />

                {/* Logo */}
                <img
                    src="/logo.png"
                    alt="Cadence Logo"
                    className="w-24 h-24 object-contain z-10 relative"
                    style={{
                        filter: isDaylight
                            ? "drop-shadow(0px 2px 4px rgba(0,0,0,0.2)) drop-shadow(0px 8px 16px rgba(0,0,0,0.15)) brightness(1.05) contrast(1.1)"
                            : "drop-shadow(0px 2px 4px rgba(0,0,0,0.6)) drop-shadow(0px 8px 16px rgba(0,0,0,0.8)) brightness(1.05) contrast(1.1)",
                        animation: "float 6s ease-in-out infinite",
                    }}
                />
            </div>

            <h2
                className="text-[2rem] tracking-[0.3em] uppercase font-display font-medium relative"
                style={{
                    color: "var(--loading-text, #FFF4D2)",
                    textShadow: isDaylight
                        ? "0 0 16px color-mix(in srgb, var(--accent-primary) 40%, transparent), 0 2px 4px rgba(0,0,0,0.15)"
                        : "0 0 24px color-mix(in srgb, var(--accent-primary) 80%, transparent), 0 4px 8px rgba(0,0,0,0.6)",
                }}
            >
                Cadence
            </h2>

            {/* Loading dots — accent-responsive */}
            <div className="loading-dots mt-8 flex items-center justify-center gap-2.5 relative z-10">
                {[0, 150, 300].map((delay) => (
                    <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{
                            backgroundColor: "var(--accent-primary, #FFD166)",
                            boxShadow: isDaylight
                                ? "0 0 6px var(--accent-primary, rgba(255,157,0,0.5))"
                                : "0 0 12px var(--accent-primary, rgba(255,157,0,1))",
                            animationDelay: `${delay}ms`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
