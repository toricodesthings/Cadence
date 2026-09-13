import { cssVars, MAPLE_LEAF, n1, placeShape, pt, rng } from "./loading-geometry";

/** Broken moon/sun streaks under x=560: short and bright at the waterline, longer and more broken toward the viewer. */
const COLUMN = (() => {
    const rand = rng(41);
    const rows: readonly (readonly [number, number])[] = [
        [990, 10], [996, 14], [1003, 18], [1011, 24], [1020, 30], [1030, 38], [1041, 46], [1053, 56], [1066, 66],
    ];
    let d = "";
    rows.forEach(([y, len], i) => {
        const segs = 1 + Math.floor(i / 3) + (rand() < 0.4 ? 1 : 0);
        const gap = 3 + i * 0.9;
        const width = len * (0.75 + rand() * 0.5);
        let x = 560 - width / 2 + (rand() - 0.5) * (6 + i * 2);
        for (let s = 0; s < segs; s++) {
            const seg = ((width - gap * (segs - 1)) / segs) * (0.6 + rand() * 0.8);
            d += `M${pt(x, y + (rand() - 0.5) * 2)}h${n1(Math.max(2, seg))}`;
            x += seg + gap;
        }
    });
    return d;
})();

const STREAKS = ([[390, 994], [700, 992], [1450, 993], [1545, 996]] as const)
    .map(([x, y]) => `M${x - 8},${y}h16M${x - 5},${y + 7}h10M${x - 3},${y + 14}h6`)
    .join("");

const FLOATING = ([[660, 1012, 30, 0.55], [880, 1040, -70, 0.6], [1250, 1022, 110, 0.5]] as const)
    .map(([x, y, r, s]) => placeShape(MAPLE_LEAF, x, y, s, r))
    .join(" ");

const VALLEY_PUFFS: readonly (readonly [number, number, number, number])[] = [
    [240, 44, 380, 26], [900, 46, 420, 24], [1560, 44, 400, 26],
];

export function LoadingWater() {
    return (
        <>
            <div className="ls-mist ls-mist-valley">
                <div className="ls-band" style={cssVars({ "--dur": "384s", "--delay": "-120s" })}>
                    <svg viewBox="0 0 3840 90" preserveAspectRatio="none">
                        <g id="ls-mist-valley-tile">
                            <rect width="1920" height="90" fill="url(#ls-mist-v-valley)" opacity=".22" />
                            {VALLEY_PUFFS.map(([cx, cy, rx, ry]) => (
                                <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#ls-mist-puff-valley)" opacity=".18" />
                            ))}
                        </g>
                        <use href="#ls-mist-valley-tile" x="-1920" />
                        <use href="#ls-mist-valley-tile" x="1920" />
                        <use href="#ls-mist-valley-tile" x="3840" />
                    </svg>
                </div>
            </div>

            <div className="ls-reflect ls-par-town">
                <svg viewBox="-8 975 1936 105" preserveAspectRatio="none">
                    <g mask="url(#ls-water-mask)">
                        <path d="M 100,1005 Q 300,995 500,1005 T 900,1005 T 1300,1005 T 1800,1005" fill="none" stroke="var(--ls-ripple)" strokeWidth="2" opacity="0.3" />
                        <path d="M 200,1025 Q 400,1015 600,1025 T 1000,1025 T 1400,1025 T 1900,1025" fill="none" stroke="var(--ls-ripple)" strokeWidth="1" opacity="0.2" />
                        <g mask="url(#ls-reflect-mask)" opacity=".3">
                            <use href="#ls-hero-town" transform="matrix(1 0 0 -1 0 1970)" />
                        </g>
                        <g className="ls-key ls-key-move">
                            <ellipse cx="560" cy="1030" rx="46" ry="52" fill="url(#ls-key-halo)" />
                            <path d={COLUMN} stroke="url(#ls-column-grad)" strokeWidth="1.8" strokeLinecap="round" />
                        </g>
                        <path d={STREAKS} stroke="var(--loading-flame-mid)" strokeWidth="1.6" strokeLinecap="round" opacity=".35" />
                    </g>
                    <path className="ls-autumn" d={FLOATING} fill="var(--ls-leaf-2)" opacity=".8" />
                </svg>
            </div>
        </>
    );
}
