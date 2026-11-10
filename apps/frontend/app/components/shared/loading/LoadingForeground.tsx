/**
 * Logo, wordmark and dots. Per-mode looks come from tokens; motion from loading-scene.css.
 *
 * The logo sits in a lantern glow that breathes with it, ringed by two thin moon-halo
 * arcs that turn slowly in opposite directions (crisp vector lines, to match the scene).
 */

/** Circumference of the r=46 ring is ~289; each dash pattern sums to that so the arcs tile once. */
import { useLayoutEffect, useRef, type Ref } from "react";

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

/** `slotRef` receives the box the current request's children portal into, under the dots. */
export function LoadingForeground({ title, slotRef }: { title?: string; slotRef?: Ref<HTMLDivElement> }) {
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

    const columnRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const column = columnRef.current;
        if (!column) return;
        // The column is centred, so a wider title, a settling font or a message under the dots
        // snaps every part to a new spot. Glide each part there instead, in step with the title roll.
        const parts = [...column.querySelectorAll<HTMLElement>(".ls-logo-block, .ls-wordmark, .ls-rule, .loading-dots")];
        // Each part's centre against its positioned parent's centre: transform-free, and blind to window size.
        const place = (el: HTMLElement) => {
            const parent = el.offsetParent as HTMLElement | null;
            return parent ? [el.offsetLeft + (el.offsetWidth - parent.offsetWidth) / 2, el.offsetTop + (el.offsetHeight - parent.offsetHeight) / 2] : null;
        };
        let last = parts.map(place);
        const observer = new ResizeObserver(() => {
            const now = parts.map(place);
            const still = getComputedStyle(column).getPropertyValue("--ls-still").trim() === "none";
            parts.forEach((el, i) => {
                const [from, to] = [last[i], now[i]];
                if (still || !from || !to || Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) < 0.5) return;
                el.animate({ translate: [`${from[0] - to[0]}px ${from[1] - to[1]}px`, "0 0"] }, { duration: 320, easing: "cubic-bezier(0.65, 0, 0.35, 1)" });
            });
            last = now;
        });
        observer.observe(column);
        parts.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={columnRef} className="relative z-10 flex flex-col items-center text-center mt-20">
            <div className="ls-enter ls-logo-block mb-6 relative flex items-center justify-center">
                <div className="ls-aura-core absolute top-1/2 left-1/2 w-64 h-64 pointer-events-none" />
                <HaloRing variant="b" dash={RING_B} sparks={[300]} />
                <HaloRing variant="a" dash={RING_A} sparks={[0]} />
                <div className="ls-aura-inner absolute top-1/2 left-1/2 w-28 h-28 pointer-events-none" />
                <div className="ls-logo-beat relative z-10">
                    <img src="/logo.png" alt="Cadence Logo" className="ls-logo block w-24 h-24 object-contain" />
                </div>
            </div>

            <h2 className="ls-enter ls-wordmark font-display font-medium relative" data-loading-title={title ? "" : undefined}>
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

            <div className="ls-enter loading-dots mt-6 flex items-center justify-center gap-2.5 relative z-10">
                {[0, 220, 440].map((delay) => (
                    <span key={delay} className="ls-dot w-1.5 h-1.5 rounded-full" style={{ animationDelay: `${delay}ms` }} />
                ))}
            </div>
            <div ref={slotRef} className="contents" />
        </div>
    );
}
