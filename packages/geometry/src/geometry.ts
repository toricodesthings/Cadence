/*
 * Deterministic geometry for the generated SVG scenes (the app's loading screen and the landing page).
 * Paths are generated on the server and the client, so everything uses an integer PRNG and plain IEEE
 * arithmetic (sqrt is exact; no Math.sin/pow), keeping output byte-identical across engines and hydration safe.
 */

export type Pt = readonly [number, number];

export function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const n1 = (v: number): number => Math.round(v * 10) / 10;
export const pt = (x: number, y: number): string => `${n1(x)},${n1(y)}`;

export const TAU = 6.283185307179586;

export function sinR(x: number): number {
    const r = x - TAU * Math.round(x / TAU);
    const r2 = r * r;
    let term = r;
    let sum = r;
    for (let i = 1; i <= 9; i++) {
        term *= -r2 / (2 * i * (2 * i + 1));
        sum += term;
    }
    return sum;
}
export const cosR = (x: number): number => sinR(x + TAU / 4);
export const rad = (deg: number): number => (deg * TAU) / 360;

/** Rotates a vector by `a` radians (clockwise on screen, where y points down). */
export function rotate([x, y]: Pt, a: number): Pt {
    const c = cosR(a);
    const s = sinR(a);
    return [x * c - y * s, x * s + y * c];
}

export function polyline(points: readonly Pt[]): string {
    return points.map(([x, y], i) => `${i ? "L" : "M"}${pt(x, y)}`).join("");
}

/** Samples an `M start Q control end0 T end1 …` chain into points `step` apart, so ridges stay smooth and x stays monotonic. */
export function quadChain(start: Pt, control: Pt, ends: readonly Pt[], step: number): Pt[] {
    const out: Pt[] = [start];
    let p0: Pt = start;
    let c: Pt = control;
    ends.forEach((p1, i) => {
        if (i > 0) c = [2 * p0[0] - c[0], 2 * p0[1] - c[1]];
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const n = Math.max(2, Math.round(Math.sqrt(dx * dx + dy * dy) / step));
        for (let k = 1; k <= n; k++) {
            const t = k / n;
            const u = 1 - t;
            out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
        }
        p0 = p1;
    });
    return out;
}

/** Smooth Catmull-Rom curve through `keys`, sampled `n` points per segment. */
export function smoothThrough(keys: readonly Pt[], n: number): Pt[] {
    const out: Pt[] = [keys[0]];
    for (let i = 0; i < keys.length - 1; i++) {
        const p0 = keys[Math.max(0, i - 1)];
        const p1 = keys[i];
        const p2 = keys[i + 1];
        const p3 = keys[Math.min(keys.length - 1, i + 2)];
        for (let k = 1; k <= n; k++) {
            const t = k / n;
            const t2 = t * t;
            const t3 = t2 * t;
            const at = (j: 0 | 1) =>
                0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
            out.push([at(0), at(1)]);
        }
    }
    return out;
}

/** Linear lookup of y on a polyline whose x is monotonic. */
export function yAt(points: readonly Pt[], x: number): number {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
    }
    return points[points.length - 1][1];
}

/** Stroke path of the slopes that rise left→right, i.e. the faces turned toward the upper-left key light. */
export function risingEdges(points: readonly Pt[]): string {
    let d = "";
    let open = false;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (b[1] < a[1] - 0.5) {
            d += open ? `L${pt(b[0], b[1])}` : `M${pt(a[0], a[1])}L${pt(b[0], b[1])}`;
            open = true;
        } else {
            open = false;
        }
    }
    return d;
}

/** One path of small circles, one per star. */
export const starPath = (stars: readonly { x: number; y: number; r: number }[]): string =>
    stars.map(({ x, y, r }) => `M${pt(x - r, y)}a${r},${r} 0 1,0 ${n1(2 * r)},0a${r},${r} 0 1,0 ${n1(-2 * r)},0`).join("");

/**
 * Box (in % of a 1920×1080 stage) holding a twinkling pair of distant stars, painted as two radial gradients
 * so one opacity animation drives both. `cool`/`warm` are the star colours.
 */
export function twinkleBox(a: Pt, b: Pt, cool: string, warm: string): Record<string, string> {
    const x0 = Math.min(a[0], b[0]) - 8;
    const y0 = Math.min(a[1], b[1]) - 8;
    const w = Math.abs(a[0] - b[0]) + 16;
    const h = Math.abs(a[1] - b[1]) + 16;
    const at = ([x, y]: Pt) => `${n1(((x - x0) / w) * 100)}% ${n1(((y - y0) / h) * 100)}%`;
    return {
        left: `${n1(x0 / 19.2)}%`,
        top: `${n1(y0 / 10.8)}%`,
        width: `${n1(w / 19.2)}%`,
        height: `${n1(h / 10.8)}%`,
        background: `radial-gradient(circle calc(2.6 * var(--su)) at ${at(a)}, ${cool} 30%, transparent), radial-gradient(circle calc(2.2 * var(--su)) at ${at(b)}, ${warm} 30%, transparent)`,
    };
}
