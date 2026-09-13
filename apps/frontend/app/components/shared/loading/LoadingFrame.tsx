import { cosR, cssVars, MAPLE_LEAF, placeShape, pt, rad, rng, sinR, type Pt } from "./loading-geometry";

/*
 * Foreground vantage (autumn only): maple boughs from the top corners and
 * susuki grass at the bottom corners, anchored to the viewport. Depth-of-field
 * blur is baked with SVG filters; sway animates whole SVG boxes.
 */

const LIMB: readonly (readonly [number, number, number])[] = [
    [-30, 20, 17], [30, 34, 14], [90, 46, 11], [150, 58, 9], [205, 74, 7], [250, 94, 5], [290, 118, 3.5],
];
const TWIGS: readonly (readonly [Pt, Pt, Pt])[] = [
    [[92, 46], [112, 96], [116, 66]],
    [[150, 58], [170, 128], [168, 90]],
    [[205, 74], [236, 142], [228, 104]],
    [[250, 94], [276, 166], [272, 128]],
    [[62, 40], [104, 14], [84, 20]],
    [[178, 65], [214, 48], [198, 52]],
];

function bough(seed: number, mirror: boolean) {
    const mx = (x: number) => (mirror ? 300 - x : x);
    const rand = rng(seed);
    const upper: string[] = [];
    const lower: string[] = [];
    LIMB.forEach(([x, y, w], i) => {
        const [px, py] = LIMB[Math.max(0, i - 1)];
        const [nx, ny] = LIMB[Math.min(LIMB.length - 1, i + 1)];
        const tx = nx - px;
        const ty = ny - py;
        const len = Math.sqrt(tx * tx + ty * ty) || 1;
        const ox = ((-ty / len) * w) / 2;
        const oy = ((tx / len) * w) / 2;
        upper.push(pt(mx(x + ox), y + oy));
        lower.push(pt(mx(x - ox), y - oy));
    });
    const wood = `M${upper.join("L")}L${lower.reverse().join("L")}Z`;
    // Twigs as thin filled quads (one fill with the limb) so the bough is a single path.
    const twigsFill = TWIGS.map(([a, b, c]) => {
        const w = 1.3;
        return `M${pt(mx(a[0] - w), a[1])}Q${pt(mx(c[0] - w), c[1])} ${pt(mx(b[0]), b[1])}Q${pt(mx(c[0] + w), c[1])} ${pt(mx(a[0] + w), a[1])}Z`;
    }).join("");

    const spots: [number, number, number][] = TWIGS.map(([, end], i) => [end[0], end[1], i >= 4 ? 10 : 180]);
    spots.push([120, 54, 180], [228, 84, 180], [285, 122, 180]);
    const leaves: { x: number; y: number; s: number; r: number }[] = [];
    for (const [cx, cy, base] of spots) {
        const count = 4 + Math.floor(rand() * 3);
        for (let k = 0; k < count; k++) {
            const x = mx(cx + (rand() - 0.5) * 34);
            const y = cy + (rand() - 0.25) * 26;
            const rot = base + (rand() - 0.5) * 80;
            leaves.push({ x, y, s: 1.5 + rand() * 0.9, r: mirror ? -rot : rot });
        }
    }
    const lit = new Set([...leaves].sort((a, b) => a.x + 1.2 * a.y - (b.x + 1.2 * b.y)).slice(0, Math.round(leaves.length * 0.35)));
    return {
        wood,
        twigsFill,
        leaves: leaves.map((l) => placeShape(MAPLE_LEAF, l.x, l.y, l.s, l.r)).join(" "),
        lit: leaves.filter((l) => lit.has(l)).map((l) => placeShape(MAPLE_LEAF, l.x, l.y, l.s, l.r)).join(" "),
        rim: leaves.filter((l) => lit.has(l)).map((l) => placeShape(MAPLE_LEAF, l.x - 1.3, l.y - 1.3, l.s, l.r)).join(" "),
    };
}

function susuki(seed: number) {
    const H = 300;
    const rand = rng(seed);
    let blades = "";
    for (let i = 0; i < 11; i++) {
        const bx = 20 + rand() * 130;
        const h = 80 + rand() * 100;
        const lean = 24 + rand() * 80;
        const w = 2.2 + rand() * 2.4;
        const cx = bx + lean * 0.25;
        const cy = H - h * 1.02;
        const tip = pt(bx + lean, H - h + lean * 0.35);
        blades += `M${pt(bx - w, H + 4)}Q${pt(cx - w * 0.5, cy)} ${tip}Q${pt(cx + w * 0.8, cy + w * 2)} ${pt(bx + w, H + 4)}Z`;
    }
    let stems = "";
    let heads = "";
    let rims = "";
    for (let j = 0; j < 4; j++) {
        const bx = 40 + rand() * 100;
        const h = 140 + rand() * 60;
        const lean = 20 + rand() * 50;
        const top: Pt = [bx + lean, H - h];
        stems += `M${pt(bx, H + 4)}Q${pt(bx + lean * 0.15, H - h * 0.6)} ${pt(top[0], top[1])}`;
        const a = rad(20 + rand() * 35);
        const len = 34 + rand() * 22;
        const dir: Pt = [cosR(a), sinR(a)];
        const nrm: Pt = [-dir[1], dir[0]];
        const plume = (ox: number, oy: number) => {
            const at = (t: number, wv: number): string =>
                pt(top[0] + ox + dir[0] * len * t + nrm[0] * wv, top[1] + oy + dir[1] * len * t + nrm[1] * wv);
            return `M${at(0, 0)}C${at(0.3, 9)} ${at(0.75, 6.2)} ${at(1, 0)}C${at(0.75, -6.2)} ${at(0.3, -9)} ${at(0, 0)}Z`;
        };
        heads += plume(0, 0);
        rims += plume(-1.4, -1.4);
    }
    return { blades, stems, heads, rims };
}

const BOUGH_TL = bough(51, false);
const BOUGH_TR = bough(53, true);
const GRASS_BL = susuki(61);
const GRASS_BR = susuki(67);

/** Only the moon-side (top-left) bough gets lit leaves and a rim; the top-right one hangs in shadow. */
function Bough({ art, side }: { art: ReturnType<typeof bough>; side: "tl" | "tr" }) {
    const moonSide = side === "tl";
    return (
        <svg className={`ls-frame ls-branch ls-par-frame ls-branch-${side}`} viewBox="0 0 300 220" aria-hidden="true">
            <path d={art.wood + art.twigsFill} fill="var(--loading-frame)" filter="url(#ls-blur-frame)" />
            {moonSide && <path d={art.rim} fill="var(--ls-persimmon)" opacity=".4" />}
            <path d={art.leaves} fill="var(--ls-bough-leaf)" filter="url(#ls-blur-bough)" />
            {moonSide && <path d={art.lit} fill="var(--ls-bough-lit)" filter="url(#ls-blur-bough)" />}
        </svg>
    );
}

function Grass({ art, side, blades, plumes }: { art: ReturnType<typeof susuki>; side: "bl" | "br"; blades: [number, number]; plumes: [number, number] }) {
    return (
        <div className={`ls-frame ls-susuki ls-par ls-par-frame ls-susuki-${side}`} aria-hidden="true">
            <svg viewBox="0 0 240 300" style={cssVars({ "--swd": `${blades[0]}s`, "--amp": `${blades[1]}deg`, "--delay": "-1.3s" })}>
                <path d={art.blades} fill="var(--ls-grass)" filter="url(#ls-blur-grass)" />
            </svg>
            <svg viewBox="0 0 240 300" style={cssVars({ "--swd": `${plumes[0]}s`, "--amp": `${plumes[1]}deg`, "--delay": "-3.2s" })}>
                <path d={art.stems} fill="none" stroke="var(--ls-grass)" strokeWidth="1.6" filter="url(#ls-blur-grass)" />
                <path d={art.rims} fill="var(--ls-persimmon)" opacity=".3" filter="url(#ls-blur-grass)" />
                <path d={art.heads} fill="var(--ls-plume)" filter="url(#ls-blur-plume)" />
            </svg>
        </div>
    );
}

/** Winter only: a small fir in the bottom-left, snow on its moon-side boughs, a few coloured lights and a star. */
const FIR_TIERS = "M60,22 L86,66 L34,66 Z M60,44 L94,100 L26,100 Z M60,74 L102,138 L18,138 Z";
const FIR_SNOW = "M60,22 L38,60 L48,58 Z M60,44 L30,94 L44,90 Z M60,74 L22,132 L40,126 Z";
const FIR_LIGHTS: readonly (readonly [number, number, string])[] = [
    [52, 58, "#ff5a4a"], [70, 64, "#ffd166"], [44, 90, "#7fd0ff"], [78, 96, "#9be27a"], [36, 126, "#ffd166"], [60, 120, "#ff5a4a"], [88, 130, "#7fd0ff"],
];

function XmasTree() {
    return (
        <svg className="ls-xmas ls-par ls-par-frame" viewBox="0 0 120 170" aria-hidden="true">
            <rect x="55" y="136" width="10" height="24" fill="var(--loading-building-back-base)" />
            {/* The boughs ruffle in the wind about the trunk base; the trunk stays put */}
            <g className="ls-xmas-body">
                <path d={FIR_TIERS} fill="var(--ls-fir)" />
                <path d={FIR_SNOW} fill="var(--loading-particle-color)" opacity=".7" />
                <g className="ls-xmas-lights">
                    {FIR_LIGHTS.map(([x, y, c]) => (
                        <g key={`${x}-${y}`}>
                            <circle cx={x} cy={y} r="5" fill={c} opacity=".28" />
                            <circle cx={x} cy={y} r="1.8" fill={c} />
                        </g>
                    ))}
                    <circle cx="60" cy="18" r="9" fill="var(--loading-key)" opacity=".25" />
                    <path d="M60,10 L62.4,16 L68.5,16.3 L63.7,20.2 L65.5,26 L60,22.6 L54.5,26 L56.3,20.2 L51.5,16.3 L57.6,16 Z" fill="var(--loading-key)" />
                </g>
            </g>
        </svg>
    );
}

export function LoadingFrame() {
    return (
        <>
            <Bough art={BOUGH_TL} side="tl" />
            <Bough art={BOUGH_TR} side="tr" />
            <Grass art={GRASS_BL} side="bl" blades={[6.2, 2]} plumes={[5.1, 3]} />
            <Grass art={GRASS_BR} side="br" blades={[7.6, 2]} plumes={[5.7, 2.6]} />
            <XmasTree />
        </>
    );
}
