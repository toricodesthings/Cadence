/**
 * Logo and wordmark. Per-mode looks come from tokens; motion from loading-scene.css.
 *
 * The logo is inlined so its parts can move: it grows in, holds while petals fall, and folds back, on a loop.
 * It sits in a lantern glow that lights as it grows, ringed by two thin moon-halo
 * arcs that turn slowly in opposite directions (crisp vector lines, to match the scene).
 */

/** Circumference of the r=46 ring is ~289; each dash pattern sums to that so the arcs tile once. */
import { useLayoutEffect, useRef, type Ref, type RefObject } from "react";
import logoSvg from "../../../../public/logo.svg?raw";

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

/** Reduced motion: the tokens set `--ls-still: none`, and motion jumps to its end. */
const isStill = (el: Element) => getComputedStyle(el).getPropertyValue("--ls-still").trim() === "none";

// The fill's clip box overhangs the text by the glow (1.5em a side); at `p` its edge sits at p × (text + 1.5em).
const fillAt = (p: number) => `calc(${p - 1} * (100% - 1.5em)) 0`;
const textAt = (p: number) => `calc(${1 - p} * (100% - 1.5em)) 0`;
const CREEP_MS = 8000;

/**
 * Fills the title to `progress`: quickly to each new mark, then a slow creep toward 90% so a long wait
 * still moves. Never backwards. A clip box slides one way and the text inside slides back, both on the
 * compositor, so the fill stays smooth while the workspace renders underneath.
 */
function useTitleFill(fillRef: RefObject<HTMLSpanElement | null>, progress: number | undefined) {
    const run = useRef<{ from: number; to: number; anims: Animation[] }>({ from: 0.1, to: 0.1, anims: [] });
    useLayoutEffect(() => {
        const box = fillRef.current;
        const text = box?.firstElementChild;
        if (!box || !text || progress === undefined) {
            run.current = { from: 0.1, to: 0.1, anims: [] };
            return;
        }
        const now = () => {
            const { from, to, anims } = run.current;
            return from + (to - from) * (anims[0]?.effect?.getComputedTiming().progress ?? 1);
        };
        const go = (to: number, duration: number, easing: string, then?: () => void) => {
            const from = now();
            run.current.anims.forEach((anim) => anim.cancel());
            const timing = { duration: isStill(box) ? 0 : duration, easing, fill: "forwards" as const };
            const anims = [box.animate({ translate: [fillAt(from), fillAt(to)] }, timing), text.animate({ translate: [textAt(from), textAt(to)] }, timing)];
            run.current = { from, to, anims };
            if (then) anims[0].finished.then(then, () => undefined);
        };
        const creep = () => go(0.9, CREEP_MS, "cubic-bezier(0.3, 0.6, 0.35, 1)");
        if (progress >= 1) go(1, 50, "cubic-bezier(0.22, 1, 0.36, 1)");
        else if (progress > now()) go(progress, 420, "cubic-bezier(0.22, 1, 0.36, 1)", creep);
        else if (!run.current.anims.length) creep();
    }, [fillRef, progress]);
}

/** `slotRef` receives the box the current request's children portal into, under the wordmark. */
export function LoadingForeground({ title, progress, slotRef }: { title?: string; progress?: number; slotRef?: Ref<HTMLDivElement> }) {
    const fillRef = useRef<HTMLSpanElement>(null);
    useTitleFill(fillRef, title ? progress : undefined);
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
        // The column is centred, so a wider title, a settling font or a message under the wordmark
        // snaps every part to a new spot. Glide each part there instead, in step with the title roll.
        const parts = [...column.querySelectorAll<HTMLElement>(".ls-logo-block, .ls-wordmark, .ls-rule")];
        // Each part's centre against its positioned parent's centre: transform-free, and blind to window size.
        const place = (el: HTMLElement) => {
            const parent = el.offsetParent as HTMLElement | null;
            return parent ? [el.offsetLeft + (el.offsetWidth - parent.offsetWidth) / 2, el.offsetTop + (el.offsetHeight - parent.offsetHeight) / 2] : null;
        };
        let last = parts.map(place);
        const observer = new ResizeObserver(() => {
            const now = parts.map(place);
            const still = isStill(column);
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
        <div ref={columnRef} className="relative z-10 flex flex-col items-center text-center">
            <div className="ls-enter ls-logo-block mb-6 relative flex items-center justify-center">
                <div className="ls-grower contents">
                    <div className="ls-aura-core absolute top-1/2 left-1/2 w-64 h-64 pointer-events-none" />
                    <HaloRing variant="b" dash={RING_B} sparks={[300]} />
                    <HaloRing variant="a" dash={RING_A} sparks={[0]} />
                    <div className="ls-aura-inner absolute top-1/2 left-1/2 w-28 h-28 pointer-events-none" />
                    <div className="ls-logo-beat relative z-10">
                        <div className="ls-logo w-30 h-30" dangerouslySetInnerHTML={{ __html: logoSvg }} />
                    </div>
                </div>
            </div>

            <h2 className="ls-enter ls-wordmark font-display font-medium relative" data-loading-title={title ? "" : undefined}>
                <span className="sr-only" role="status">{title ?? "Cadence"}</span>
                <span className="ls-wordmark-halo" aria-hidden="true" />
                <span className="ls-rule ls-rule-l" aria-hidden="true" />
                <span className="ls-wordmark-flip" aria-hidden="true">
                    <span className="ls-wordmark-cube" ref={cubeRef}>
                        <span className="ls-wordmark-brand uppercase">Cadence</span>
                        {title && (
                            <span className="ls-wordmark-title">
                                {progress === undefined ? title : (
                                    <>
                                        <span className="ls-title-muted">{title}</span>
                                        <span className="ls-title-fill" ref={fillRef}><span>{title}</span></span>
                                    </>
                                )}
                            </span>
                        )}
                    </span>
                </span>
                <span className="ls-rule ls-rule-r" aria-hidden="true" />
            </h2>

            <div ref={slotRef} className="contents" />
        </div>
    );
}
