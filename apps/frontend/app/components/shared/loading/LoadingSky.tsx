import { cloud, cssVars, n1, pt, rng, type Pt } from "./loading-geometry";

interface Star {
    x: number;
    y: number;
    r: number;
    warm: boolean;
}

const MOON: Pt = [560, 300];

const STARS: Star[] = (() => {
    const rand = rng(11);
    const out: Star[] = [];
    for (let guard = 0; out.length < 26 && guard < 4000; guard++) {
        const x = 30 + rand() * 1860;
        const y = 30 + rand() * 540;
        const mx = x - MOON[0];
        const my = y - MOON[1];
        const tier = rand();
        const warm = rand() < 0.3;
        if (Math.sqrt(mx * mx + my * my) < 250) continue;
        if (out.some((s) => Math.abs(s.x - x) < 70 && Math.abs(s.y - y) < 50)) continue;
        out.push({ x, y, r: tier < 0.55 ? 0.6 : tier < 0.88 ? 1.1 : 1.8, warm });
    }
    return out;
})();

/** Cumulative star sets: 6 spring · 8 summer · 18 autumn · 26 winter. */
const STAR_SETS: readonly (readonly [number, number, string | undefined])[] = [
    [0, 6, undefined],
    [6, 8, "ls-stars-8"],
    [8, 18, "ls-stars-18"],
    [18, 26, "ls-stars-26"],
];

const starPath = (stars: Star[]) =>
    stars.map(({ x, y, r }) => `M${pt(x - r, y)}a${r},${r} 0 1,0 ${n1(2 * r)},0a${r},${r} 0 1,0 ${n1(-2 * r)},0`).join("");

const MARIA = "M537,290a11,8 0 1,0 22,0a11,8 0 1,0 -22,0M564,306a8,6 0 1,0 16,0a8,6 0 1,0 -16,0M550,318a6,4 0 1,0 12,0a6,4 0 1,0 -12,0";

/** Six twinklers as three opacity-animated pairs of distant stars (keeps the animation budget). */
const TWINKLE_PAIRS: readonly { a: Pt; b: Pt; dur: number; delay: number }[] = [
    { a: [1250, 84], b: [1470, 196], dur: 4.3, delay: -1.2 },
    { a: [150, 372], b: [296, 236], dur: 5.9, delay: -3.1 },
    { a: [1668, 118], b: [1836, 318], dur: 7.1, delay: -0.4 },
];

function twinkleStyle({ a, b, dur, delay }: (typeof TWINKLE_PAIRS)[number]) {
    const x0 = Math.min(a[0], b[0]) - 8;
    const y0 = Math.min(a[1], b[1]) - 8;
    const w = Math.abs(a[0] - b[0]) + 16;
    const h = Math.abs(a[1] - b[1]) + 16;
    const at = ([x, y]: Pt) => `${n1(((x - x0) / w) * 100)}% ${n1(((y - y0) / h) * 100)}%`;
    return cssVars({
        left: `${n1(x0 / 19.2)}%`,
        top: `${n1(y0 / 10.8)}%`,
        width: `${n1(w / 19.2)}%`,
        height: `${n1(h / 10.8)}%`,
        background: `radial-gradient(circle calc(2.6 * var(--su)) at ${at(a)}, var(--ls-star-cool) 30%, transparent), radial-gradient(circle calc(2.2 * var(--su)) at ${at(b)}, var(--ls-star-warm) 30%, transparent)`,
        "--dur": `${dur}s`,
        "--delay": `${delay}s`,
    });
}

/** Drifting cloud bank (one 1920-wide tile, y 120–420): [cx, base, width, height]. */
const DRIFT_CLOUDS = ([[640, 372, 300, 58], [1250, 236, 420, 72], [1730, 336, 260, 50], [180, 214, 250, 46]] as const).map(
    ([cx, base, w, h], i) => cloud(cx, base, w, h, 71 + i),
);

/** Spring's overcast: wider, flatter clouds that stay put. */
const SPRING_CLOUDS = ([[300, 220, 420, 50], [800, 175, 520, 60], [1400, 270, 380, 44], [1700, 205, 460, 54], [500, 318, 340, 38]] as const).map(
    ([cx, base, w, h], i) => cloud(cx, base, w, h, 81 + i),
);

/** Two-tone cloud: a shadowed underside nudged down-right (warmed by the valley glow on low clouds), a moonlit crest nudged up-left, then the body. */
function Cloud({ d, low }: { d: string; low?: boolean }) {
    return (
        <>
            <path d={d} fill={low ? "color-mix(in srgb, var(--ls-cloud-base) 80%, var(--loading-sky-glow))" : "var(--ls-cloud-base)"} opacity=".45" transform="translate(3 6)" />
            <path d={d} fill="var(--ls-cloud-rim)" opacity=".6" transform="translate(-4 -7)" />
            <path d={d} fill="url(#ls-cloud-grad)" />
        </>
    );
}

export function LoadingSky() {
    return (
        <>
            <rect width="1920" height="1080" fill="url(#sky-grad)" />
            <rect width="1920" height="1080" fill="url(#ls-sky-overlay)" />
            <circle cx="960" cy="830" r="600" fill="url(#ls-sky-glow)" />

            <g className="ls-spring ls-spring-clouds">
                {SPRING_CLOUDS.map((d) => (
                    <Cloud key={d} d={d} />
                ))}
            </g>

            <g className="ls-night" mask="url(#ls-star-mask)">
                {STAR_SETS.flatMap(([from, to, cls]) => {
                    const set = STARS.slice(from, to);
                    return [
                        <path key={`${from}c`} className={cls} d={starPath(set.filter((s) => !s.warm))} fill="var(--ls-star-cool)" />,
                        <path key={`${from}w`} className={cls} d={starPath(set.filter((s) => s.warm))} fill="var(--ls-star-warm)" />,
                    ];
                })}
            </g>

            <g className="ls-key ls-moon">
                <circle cx={MOON[0]} cy={MOON[1]} r="360" fill="url(#ls-key-halo-wide)" />
                <circle cx={MOON[0]} cy={MOON[1]} r="170" fill="url(#ls-key-halo)" />
                {/* Summer: the key light is the sun, so it throws a wider, warmer haze */}
                <circle className="ls-summer" cx={MOON[0]} cy={MOON[1]} r="290" fill="url(#ls-key-halo)" opacity=".8" />
                <circle className="ls-summer" cx={MOON[0]} cy={MOON[1]} r="54" fill="url(#ls-key-disk)" />
                <circle cx={MOON[0]} cy={MOON[1]} r="42" fill="url(#ls-key-disk)" />
                <path className="ls-night" d={MARIA} fill="var(--loading-sky-zenith)" opacity=".05" />
            </g>
        </>
    );
}

/** HTML-level sky motion (compositor-only): star twinklers and the drifting cloud band. */
export function LoadingSkyMotion() {
    return (
        <>
            {TWINKLE_PAIRS.map((pair) => (
                <div key={pair.dur} className="ls-twinkle ls-night" style={twinkleStyle(pair)} />
            ))}
            <div className="ls-cloud">
                <div className="ls-band" style={cssVars({ "--dur": "480s", "--delay": "-170s" })}>
                    <svg viewBox="0 120 3840 300" preserveAspectRatio="none">
                        <g id="ls-cloud-tile" opacity=".8" filter="url(#ls-blur-cloud)">
                            {DRIFT_CLOUDS.map((d, i) => (
                                // Every other cloud is optional: winter keeps a clearer sky
                                <g key={d} className={i % 2 ? "ls-cloud-opt" : undefined}>
                                    <Cloud d={d} low={i === 0 || i === 2} />
                                </g>
                            ))}
                        </g>
                        <use href="#ls-cloud-tile" x="1920" />
                    </svg>
                </div>
            </div>
        </>
    );
}
