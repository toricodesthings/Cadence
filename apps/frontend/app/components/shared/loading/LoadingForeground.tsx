import { useLayoutEffect, useRef, type Ref, type RefObject } from "react";
import logoSvg from "../../../../public/logo.svg?raw";

const RING_A = "78 16 5 16 46 128";
const RING_B = "120 40 4 125";

function HaloRing({ variant, dash, sparks }: { variant: "a" | "b"; dash: string; sparks: readonly number[] }) {
    return (
        <div className={`ls-halo-ring ls-halo-ring-${variant}`} aria-hidden="true">
            <svg viewBox="0 0 100 100">
                <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="url(#ls-halo-grad)"
                    strokeWidth={variant === "a" ? 0.9 : 0.55}
                    strokeDasharray={dash}
                    strokeLinecap="round"
                />
                {sparks.map((deg) => (
                    <circle
                        key={deg}
                        cx="50"
                        cy="4"
                        r={variant === "a" ? 1.3 : 0.9}
                        fill="var(--accent-primary, #FFD166)"
                        transform={`rotate(${deg} 50 50)`}
                    />
                ))}
            </svg>
        </div>
    );
}

const isStill = (el: Element) => getComputedStyle(el).getPropertyValue("--ls-still").trim() === "none";

const fillAt = (p: number) => `calc(${p - 1} * (100% - 1.5em)) 0`;
const textAt = (p: number) => `calc(${1 - p} * (100% - 1.5em)) 0`;
const CREEP_MS = 8000;

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
            const anims = [
                box.animate({ translate: [fillAt(from), fillAt(to)] }, timing),
                text.animate({ translate: [textAt(from), textAt(to)] }, timing),
            ];
            run.current = { from, to, anims };
            if (then) anims[0].finished.then(then, () => undefined);
        };
        const creep = () => go(0.9, CREEP_MS, "cubic-bezier(0.3, 0.6, 0.35, 1)");
        const apply = () => {
            if (progress >= 1) go(1, 50, "cubic-bezier(0.22, 1, 0.36, 1)");
            else if (progress > now()) go(progress, 420, "cubic-bezier(0.22, 1, 0.36, 1)", creep);
            else if (!run.current.anims.length) creep();
        };
        const current = run.current.anims[0];
        if (!current?.pending) return apply();
        let live = true;
        current.ready.then(
            () => live && apply(),
            () => undefined,
        );
        return () => {
            live = false;
        };
    }, [fillRef, progress]);
}

export function LoadingForeground({
    title,
    progress,
    slotRef,
}: {
    title?: string;
    progress?: number;
    slotRef?: Ref<HTMLDivElement>;
}) {
    const fillRef = useRef<HTMLSpanElement>(null);
    useTitleFill(fillRef, title ? progress : undefined);

    const columnRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const column = columnRef.current;
        if (!column) return;
        const parts = [...column.querySelectorAll<HTMLElement>(".ls-logo-block, .ls-wordmark, .ls-rule")];
        const place = (el: HTMLElement) => {
            const parent = el.offsetParent as HTMLElement | null;
            return parent
                ? [
                      el.offsetLeft + (el.offsetWidth - parent.offsetWidth) / 2,
                      el.offsetTop + (el.offsetHeight - parent.offsetHeight) / 2,
                  ]
                : null;
        };
        let last = parts.map(place);
        const observer = new ResizeObserver(() => {
            const now = parts.map(place);
            const still = isStill(column);
            parts.forEach((el, i) => {
                const [from, to] = [last[i], now[i]];
                if (still || !from || !to || Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) < 0.5) return;
                el.animate(
                    { translate: [`${from[0] - to[0]}px ${from[1] - to[1]}px`, "0 0"] },
                    { duration: 320, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
                );
            });
            last = now;
        });
        observer.observe(column);
        parts.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={columnRef} className="ls-column relative z-10 flex flex-col items-center text-center">
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

            <h2
                className="ls-enter ls-wordmark font-display font-medium relative"
                data-loading-title={title ? "" : undefined}
            >
                <span className="sr-only" role="status">
                    {title ?? "Cadence"}
                </span>
                <span className="ls-wordmark-halo" aria-hidden="true" />
                <span className="ls-rule ls-rule-l" aria-hidden="true" />
                <span className="ls-wordmark-faces" aria-hidden="true">
                    <span className="ls-wordmark-brand uppercase">Cadence</span>
                    {title && (
                        <span className="ls-wordmark-title">
                            {progress === undefined ? (
                                title
                            ) : (
                                <>
                                    <span className="ls-title-muted">{title}</span>
                                    <span className="ls-title-fill" ref={fillRef}>
                                        <span>{title}</span>
                                    </span>
                                </>
                            )}
                        </span>
                    )}
                </span>
                <span className="ls-rule ls-rule-r" aria-hidden="true" />
            </h2>

            <div ref={slotRef} className="contents" />
        </div>
    );
}
