import { useId, type ReactNode } from "react";

/** The profile header's night sky: glow, waves and two sparks. `children` (the avatar) sit on top, positioned by the caller. */
export function ProfileBanner({ children, className = "h-32" }: { children?: ReactNode; className?: string }) {
    const id = useId();
    return (
        <div className={`${className} relative border-b border-twilight-border isolate`}>
            {/* Inner wrapper specifically for overflow hidden background constraints */}
            <div className="absolute inset-0 overflow-hidden bg-twilight-surface -z-10 profile-banner-bg">
                {/* Atmospheric glow blobs per Manifesto */}
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-[var(--accent-primary)] opacity-[0.14] rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[var(--color-moonlit)] opacity-[0.12] rounded-full blur-[80px] pointer-events-none" />

                {/* Abstract Topological SVG Waves */}
                <svg
                    className="absolute inset-0 w-full h-full opacity-30 mix-blend-overlay pointer-events-none"
                    preserveAspectRatio="none"
                    viewBox="0 0 1000 200"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M-100,100 C200,50 400,150 700,80 C900,30 1100,120 1200,60 L1200,200 L-100,200 Z"
                        fill={`url(#${id}-moonlit)`}
                    />
                    <path
                        d="M-50,250 C150,150 500,250 800,100 C1000,0 1150,150 1250,50 L1250,-50 L-50,-50 Z"
                        fill={`url(#${id}-amber)`}
                    />

                    <defs>
                        <linearGradient id={`${id}-moonlit`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--color-moonlit)" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id={`${id}-amber`} x1="100%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="transparent" stopOpacity="0.1" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Star / Lantern Sparks Geometry */}
                <svg
                    className="absolute right-[15%] top-6 w-12 h-12 opacity-40 text-[var(--accent-primary)]"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z" fill="currentColor" />
                </svg>
                <svg
                    className="absolute left-[30%] top-10 w-6 h-6 opacity-30 text-[var(--color-moonlit)]"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path d="M50 0 L53 47 L100 50 L53 53 L50 100 L47 53 L0 50 L47 47 Z" fill="currentColor" />
                </svg>
            </div>
            {children}
        </div>
    );
}
