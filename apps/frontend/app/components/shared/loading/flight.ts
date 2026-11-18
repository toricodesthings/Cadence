/**
 * The arrival flight: the scene drifts into the valley and dissolves while the app is live underneath.
 *
 * Every layer gets its own `scale` / `translate` / `opacity` animation, all on one spring easing, so the
 * compositor plays them even while the revealed workspace holds the main thread (a custom-property driver
 * froze there on iOS and the scene just vanished). Fades run over a slice [from, from + span] of the
 * eased progress, so nearer layers go first.
 */

// The one knob for how far it travels; reduced motion sets it to 0 in loading-scene.css.
const flyK = (screen: Element) => Number.parseFloat(getComputedStyle(screen).getPropertyValue("--ls-fly-k")) || 0;

/** 600ms, or a 200ms fade when reduced motion zeroes the travel. */
export const flyMs = () => {
    const screen = document.querySelector(".loading-screen");
    return screen && flyK(screen) === 0 ? 200 : 600;
};

// A critically damped spring from rest (x = 1 − (1 + ωt)e^(−ωt), ω = 6), normalised to end at 1.
const FLY_EASE = (() => {
    const x = (t: number) => 1 - (1 + 6 * t) * Math.exp(-6 * t);
    const samples = Array.from({ length: 24 }, (_, i) => (x(i / 23) / x(1)).toFixed(4));
    return `linear(${samples.join(", ")})`;
})();
const FLY_FALLBACK = "cubic-bezier(0.3, 0, 0.15, 1)";

type Layer = { sel: string; depth?: number; fade?: [from: number, span: number]; lift?: boolean };
// depth: how much nearer the plane is (its scale grows by k × depth); the column also rises as it grows.
const FLIGHT: Layer[] = [
    { sel: ".ls-par-far", depth: 1.5 },
    { sel: ".ls-par-town", depth: 4 },
    { sel: ".ls-par-near", depth: 9, fade: [0.1, 0.55] },
    { sel: ".ls-particles", depth: 10, fade: [0.05, 0.5] },
    { sel: ".ls-fly-frame", depth: 8, fade: [0, 0.5] },
    { sel: ".ls-column", depth: 1.67, fade: [0.1, 0.5], lift: true },
    { sel: ".ls-vignette", fade: [0, 0.7] },
];

/** Opacity from `start` to 0 across [from, from + span]; `smooth` gives the ends zero slope (smoothstep). */
function fadeFrames(start: number, [from, span]: [number, number], smooth = false): Keyframe[] {
    const steps = smooth ? [0, 0.25, 0.5, 0.75, 1] : [0, 1];
    const ease = (t: number) => (smooth ? t * t * (3 - 2 * t) : t);
    const frames = steps.map((t) => ({ offset: Math.min(from + span * t, 1), opacity: start * (1 - ease(t)) }));
    return [{ offset: 0, opacity: start }, ...frames, { offset: 1, opacity: 0 }];
}

/** Starts the flight on every layer of `screen`. Reverse them all to glide home. */
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
