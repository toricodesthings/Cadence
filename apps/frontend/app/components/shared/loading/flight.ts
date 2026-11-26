const flyK = (screen: Element) => Number.parseFloat(getComputedStyle(screen).getPropertyValue("--ls-fly-k")) || 0;

export const flyMs = () => {
    const screen = document.querySelector(".loading-screen");
    return screen && flyK(screen) === 0 ? 200 : 600;
};

const FLY_EASE = (() => {
    const x = (t: number) => 1 - (1 + 6 * t) * Math.exp(-6 * t);
    const samples = Array.from({ length: 24 }, (_, i) => (x(i / 23) / x(1)).toFixed(4));
    return `linear(${samples.join(", ")})`;
})();
const FLY_FALLBACK = "cubic-bezier(0.3, 0, 0.15, 1)";

type Layer = { sel: string; depth?: number; fade?: [from: number, span: number]; lift?: boolean };
const FLIGHT: Layer[] = [
    { sel: ".ls-par-far", depth: 1.5 },
    { sel: ".ls-par-town", depth: 4 },
    { sel: ".ls-par-near", depth: 9, fade: [0.1, 0.55] },
    { sel: ".ls-particles", depth: 10, fade: [0.05, 0.5] },
    { sel: ".ls-fly-frame", depth: 8, fade: [0, 0.5] },
    { sel: ".ls-column", depth: 1.67, fade: [0.1, 0.5], lift: true },
    { sel: ".ls-vignette", fade: [0, 0.7] },
];

function fadeFrames(start: number, [from, span]: [number, number], smooth = false): Keyframe[] {
    const steps = smooth ? [0, 0.25, 0.5, 0.75, 1] : [0, 1];
    const ease = (t: number) => (smooth ? t * t * (3 - 2 * t) : t);
    const frames = steps.map((t) => ({ offset: Math.min(from + span * t, 1), opacity: start * (1 - ease(t)) }));
    return [{ offset: 0, opacity: start }, ...frames, { offset: 1, opacity: 0 }];
}

export function startFlight(screen: HTMLElement): Animation[] {
    const k = flyK(screen);
    const duration = flyMs();
    const animate = (el: Element, frames: Keyframe[] | PropertyIndexedKeyframes) => {
        try {
            return el.animate(frames, { duration, easing: FLY_EASE, fill: "both" });
        } catch {
            return el.animate(frames, { duration, easing: FLY_FALLBACK, fill: "both" });
        }
    };
    const anims: Animation[] = [];
    for (const { sel, depth, fade, lift } of FLIGHT) {
        for (const el of screen.querySelectorAll(sel)) {
            const style = getComputedStyle(el);
            if (depth && k) {
                const base = style.scale === "none" ? 1 : Number.parseFloat(style.scale) || 1;
                anims.push(animate(el, { scale: [String(base), String(base * (1 + k * depth))] }));
            }
            if (lift && k) anims.push(animate(el, { translate: ["0 0", `0 ${-67 * k}%`] }));
            if (fade) anims.push(animate(el, fadeFrames(Number.parseFloat(style.opacity) || 0, fade)));
        }
    }
    anims.push(animate(screen, fadeFrames(1, [0.15, 0.7], true)));
    return anims;
}
