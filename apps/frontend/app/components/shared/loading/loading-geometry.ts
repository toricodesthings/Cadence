import type { CSSProperties } from "react";

/*
 * Deterministic geometry helpers for the loading scene. Everything here runs at
 * module load on both the pre-render (Node) and the client, so it only uses
 * integer PRNG + plain IEEE arithmetic (no Math.sin/pow) to keep generated
 * paths byte-identical across engines — otherwise hydration would mismatch.
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
export const cssVars = (vars: Record<string, string | number>): CSSProperties => vars as CSSProperties;

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

const SHAPE_TOKEN = /[A-Za-z]|-?\d*\.?\d+/g;

/** Re-emits an absolute-command path (M/L/Q/C/Z) scaled, rotated and moved to (cx, cy). */
export function placeShape(shape: string, cx: number, cy: number, scale: number, rotDeg: number): string {
    const a = rad(rotDeg);
    const cos = cosR(a) * scale;
    const sin = sinR(a) * scale;
    const parts: string[] = [];
    let pendingX: number | null = null;
    for (const tk of shape.match(SHAPE_TOKEN) ?? []) {
        if (/[A-Za-z]/.test(tk)) {
            parts.push(tk);
            pendingX = null;
            continue;
        }
        const val = parseFloat(tk);
        if (pendingX === null) {
            pendingX = val;
            continue;
        }
        parts.push(pt(cx + pendingX * cos - val * sin, cy + pendingX * sin + val * cos));
        pendingX = null;
    }
    return parts.join(" ");
}

/**
 * Anime cumulus: a low dome under overlapping puffs that swell toward the middle, plus a small crown.
 * Base puffs are circles cut at the base line (flat underside, no seams); every subpath winds
 * clockwise, so one nonzero-filled path is the whole cloud.
 */
export function cloud(cx: number, base: number, w: number, h: number, seed: number): string {
    const rand = rng(seed);
    const left = cx - w / 2;
    let d = `M${pt(left, base)}A${n1(w / 2)},${n1(h * 0.35)} 0 0,1 ${pt(left + w, base)}Z`;
    const n = Math.max(4, Math.round(w / (h * 0.55)));
    const rEnd = h * 0.36;
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const swell = 1 - Math.abs(t - 0.5) * 2;
        const r = rEnd + h * 0.26 * swell * (0.8 + rand() * 0.4);
        const x = left + 0.8 * rEnd + (w - 1.6 * rEnd) * t + (rand() - 0.5) * h * 0.12;
        // Centre 0.6r above the base, so the circle meets the base line 0.8r either side.
        d += `M${pt(x - 0.8 * r, base)}A${n1(r)},${n1(r)} 0 1,1 ${pt(x + 0.8 * r, base)}Z`;
    }
    const crowns = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < crowns; k++) {
        // Sunk well into the middle puffs so the crown swells out of the body instead of perching on it.
        const x = cx + (k - (crowns - 1) / 2) * h * 0.5 + (rand() - 0.5) * h * 0.15;
        const y = base - h * (0.78 + rand() * 0.08);
        const r = h * (0.28 + rand() * 0.08);
        d += `M${pt(x - r, y)}a${n1(r)},${n1(r)} 0 1,1 ${n1(2 * r)},0a${n1(r)},${n1(r)} 0 1,1 ${n1(-2 * r)},0`;
    }
    return d;
}

/** Leaf details for the falling sprites: the right half (shaded to read as a folded surface) and the veins. */
export const MAPLE_HALF = "M0,-10L1.6,-5.2L4.4,-6.8L4,-3L8,-5L6.4,-0.8L9.2,2.6L4.6,2.4L4.2,5.6L1,3.6L0.4,4L0,4Z";
export const MAPLE_VEINS = "M0,4L0,-8.6M0,2.6L6.8,-4.2M0,2.6L-6.8,-4.2M0.2,3.2L8,2.4M-0.2,3.2L-8,2.4";
export const GINKGO_HALF = "M0,-7L0.8,-9.5C3,-10.5 7,-9 9.5,-6C8,-2 3,1.5 0.3,2.5L0,2.5Z";
export const GINKGO_VEINS = "M0,2.2L-6.8,-6.4M0,2.2L-3.4,-8.8M0,2.2L0,-7M0,2.2L3.4,-8.8M0,2.2L6.8,-6.4";

export const MAPLE_LEAF =
    "M0,-10 L1.6,-5.2 L4.4,-6.8 L4,-3 L8,-5 L6.4,-0.8 L9.2,2.6 L4.6,2.4 L4.2,5.6 L1,3.6 L0.4,4 L0.6,9.6 L-0.6,9.6 L-0.4,4 L-1,3.6 L-4.2,5.6 L-4.6,2.4 L-9.2,2.6 L-6.4,-0.8 L-8,-5 L-4,-3 L-4.4,-6.8 L-1.6,-5.2 Z";
export const GINKGO_LEAF =
    "M-0.4,9 L-0.3,2.5 C-3,1.5 -8,-2 -9.5,-6 C-7,-9 -3,-10.5 -0.8,-9.5 L0,-7 L0.8,-9.5 C3,-10.5 7,-9 9.5,-6 C8,-2 3,1.5 0.3,2.5 L0.4,9 Z";

/* ── Shared shapes: drawn in the near landscape and cut out of the water masks ── */

export const WATER_D = "M0,985 Q480,965 960,985 T1920,985 L1920,1080 L0,1080 Z";

function deck(x0: number, y0: number, x1: number, y1: number, posts: readonly number[], postBottom: number) {
    const th = 8;
    const yOn = (x: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    let shape = `M${pt(x0, y0)}L${pt(x1, y1)}L${pt(x1, y1 + th)}L${pt(x0, y0 + th)}Z`;
    for (const px of posts) {
        const yt = yOn(px) + th - 1;
        shape += `M${pt(px - 3, yt)}L${pt(px + 3, yt)}L${pt(px + 3, postBottom)}L${pt(px - 3, postBottom)}Z`;
    }
    let planks = "";
    for (let x = Math.min(x0, x1) + 10; x < Math.max(x0, x1) - 4; x += 15) {
        planks += `M${pt(x, yOn(x) + 0.6)}L${pt(x + 1.5, yOn(x) + th - 0.6)}`;
    }
    return { shape, planks, edge: `M${pt(x0, y0)}L${pt(x1, y1)}`, yOn };
}

const LEFT_PIER = deck(-30, 1030, 478, 1017, [36, 146, 256, 366, 470], 1074);
const RIGHT_PIER = deck(1450, 1016, 1950, 1029, [1470, 1580, 1690, 1800, 1910], 1072);

export const PIER_D = `${LEFT_PIER.shape}${RIGHT_PIER.shape}M467,${n1(LEFT_PIER.yOn(470))}L473,${n1(LEFT_PIER.yOn(470))}L473,978L467,978Z`;
export const PIER_PLANKS = LEFT_PIER.planks + RIGHT_PIER.planks;
export const PIER_EDGES = LEFT_PIER.edge + RIGHT_PIER.edge;

export const TERRACE_D =
    "M312,987L518,984L526,1018L305,1022Z M1372,958L1668,956L1676,993L1364,996Z M-40,1017L300,1015L310,1050L-40,1054Z";
export const TERRACE_CAPS = "M312,987L518,984M1372,958L1668,956M-40,1017L300,1015";
