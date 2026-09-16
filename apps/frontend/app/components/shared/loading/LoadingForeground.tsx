/**
 * Logo, wordmark and dots. Per-mode looks come from tokens; motion from loading-scene.css.
 *
 * The logo sits in a lantern glow that breathes with it, ringed by two thin moon-halo
 * arcs that turn slowly in opposite directions (crisp vector lines, to match the scene).
 */

/** Circumference of the r=46 ring is ~289; each dash pattern sums to that so the arcs tile once. */
import { useLayoutEffect, useRef, type ReactNode } from "react";

const RING_A = "78 16 5 16 46 128";
const RING_B = "120 40 4 125";

function HaloRing({ variant, dash, sparks }: { variant: "a" | "b"; dash: string; sparks: readonly number[] }) {
    return (
        <svg className={`ls-halo-ring ls-halo-ring-${variant}`} viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="none" stroke="url(#ls-halo-grad)" strokeWidth={variant === "a" ? 0.9 : 0.55} strokeDasharray={dash} strokeLinecap="round" />
            {sparks.map((deg) => (
                <circle key={deg} cx="50" cy="4" r={variant === "a" ? 1.3 : 0.9} fill="var(--accent-primary, #FFD166)" transform={`rotate(${deg} 50 50)`} />
            ))}
        </svg>
    );
}

export function LoadingForeground({ title, children }: { title?: string; children?: ReactNode }) {
    const cubeRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const cube = cubeRef.current;
        if (!cube) return;
        // Adjacent faces share an edge, including when the message wraps on phones.
        const measure = () => cube.style.setProperty("--ls-wordmark-depth", `${cube.offsetHeight / 2}px`);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(cube);
        return () => observer.disconnect();
    }, [title]);

    return (
        <div className="relative z-10 flex flex-col items-center text-center mt-20">
            <div className="ls-logo-block mb-10 relative flex items-center justify-center">
                <div className="ls-aura-core absolute top-1/2 left-1/2 w-64 h-64 pointer-events-none" />
                <HaloRing variant="b" dash={RING_B} sparks={[300]} />
                <HaloRing variant="a" dash={RING_A} sparks={[0, 62]} />
                <div className="ls-aura-inner absolute top-1/2 left-1/2 w-28 h-28 pointer-events-none" />
                <div className="ls-logo-beat relative z-10">
                    <img src="/logo.png" alt="Cadence Logo" className="ls-logo block w-24 h-24 object-contain" />
                </div>
            </div>

            <h2 className="ls-wordmark font-display font-medium relative" data-loading-title={title ? "" : undefined}>
                <span className="sr-only" role="status">{title ?? "Cadence"}</span>
                <span className="ls-wordmark-halo" aria-hidden="true" />
                <span className="ls-rule ls-rule-l" aria-hidden="true" />
                <span className="ls-wordmark-flip" aria-hidden="true">
                    <span className="ls-wordmark-cube" ref={cubeRef}>
                        <span className="ls-wordmark-brand uppercase">Cadence</span>
                        {title && <span className="ls-wordmark-title">{title}</span>}
                    </span>
                </span>
                <span className="ls-rule ls-rule-r" aria-hidden="true" />
            </h2>

            <div className="loading-dots mt-8 flex items-center justify-center gap-2.5 relative z-10">
                {[0, 140, 280].map((delay) => (
                    <span key={delay} className="ls-dot w-1.5 h-1.5 rounded-full" style={{ animationDelay: `${delay}ms` }} />
                ))}
            </div>
            {children}
        </div>
    );
}
