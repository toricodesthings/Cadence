import { cssVars, n1, polyline, pt, risingEdges, rng, smoothThrough, yAt, type Pt } from "./loading-geometry";

const ridge = (points: readonly Pt[]) => `M0,1080L${polyline(points).slice(1)}L1920,1080Z`;
const dot = (x: number, y: number, rx: number, ry = rx) => `M${pt(x - rx, y)}a${n1(rx)},${n1(ry)} 0 1,0 ${n1(2 * rx)},0a${n1(rx)},${n1(ry)} 0 1,0 ${n1(-2 * rx)},0`;

/** A natural crest: smooth through hand-placed keys, then roughened by two octaves of seeded value noise (`rough` px). */
function crest(keys: readonly Pt[], seed: number, rough: number): Pt[] {
    const rand = rng(seed);
    const lattice = Array.from({ length: 128 }, () => rand() - 0.5);
    const noise = (x: number, cell: number) => {
        const f = x / cell + 4;
        const i = Math.floor(f);
        const t = f - i;
        return lattice[i % 128] + (lattice[(i + 1) % 128] - lattice[i % 128]) * t * t * (3 - 2 * t);
    };
    return smoothThrough(keys, 10).map(([x, y]) => [x, y + rough * (noise(x, 52) + 0.4 * noise(x + 700, 19))] as const);
}

/**
 * A summit's two faces, split by a spine that wanders down from it: the moon-side face (left, lit)
 * and the lee face (right, shaded). Each fades out downhill, so only the spine reads as a line.
 */
function faces(points: readonly Pt[], [px, left, right, drop, lean]: Peak, seed: number) {
    const rand = rng(seed);
    const top: Pt = [px, yAt(points, px)];
    const spine: Pt[] = [top];
    for (let k = 1; k <= 5; k++) {
        const t = k / 5;
        spine.push([px + lean * t + (k % 2 ? 1 : -1) * (5 + rand() * 9) * (0.4 + t), top[1] + drop * t]);
    }
    const down = polyline(spine).slice(1);
    const side = (from: number, to: number) => points.filter(([x]) => x > from && x < to);
    return {
        lit: `${polyline([...side(px - left, px), top])}L${down}Z`,
        shade: `${polyline([...side(px, px + right).reverse(), top])}L${down}Z`,
    };
}

type Peak = readonly [x: number, left: number, right: number, drop: number, lean: number];
/** Each face is its own path, so the bounding-box gradients run from that summit down. */
const allFaces = (points: readonly Pt[], peaks: readonly Peak[], seed: number) => peaks.map((peak, i) => faces(points, peak, seed + i));

/* Furthest: a pale range across the whole horizon, seen through the saddle of the nearer mountains. */
const DISTANT = crest(
    [[-20, 668], [110, 640], [230, 655], [330, 612], [420, 562], [500, 598], [575, 584], [660, 622], [780, 646], [900, 630], [1010, 604],
        [1090, 572], [1160, 594], [1260, 634], [1380, 650], [1500, 624], [1600, 642], [1760, 614], [1940, 650]],
    17, 5,
);
const DISTANT_D = ridge(DISTANT);
const DISTANT_RIM = risingEdges(DISTANT.filter((_, i) => i % 4 === 0));
const DISTANT_FACES = allFaces(DISTANT, [[420, 96, 110, 100, 16], [1090, 96, 110, 90, 14], [1760, 120, 120, 70, 14]], 31);

/* The mountains proper: a massif on the left, a lower summit behind the wordmark, the great peak on the right. */
const FAR = crest(
    [[0, 640], [90, 598], [170, 564], [240, 548], [300, 574], [380, 636], [470, 668], [560, 692], [680, 706], [800, 690], [880, 644], [950, 604],
        [1010, 586], [1070, 608], [1150, 660], [1240, 702], [1330, 692], [1410, 650], [1470, 606], [1520, 560], [1556, 548], [1596, 498], [1640, 446], [1672, 420],
        [1700, 410], [1738, 436], [1776, 458], [1820, 512], [1868, 536], [1920, 590]],
    19, 9,
);
const FAR_FACES = allFaces(FAR, [[240, 170, 150, 170, 34], [1010, 140, 150, 130, 26], [1700, 250, 200, 300, 50]], 41);

/* Wooded hills in front of them. */
const MID_FAR = crest(
    [[0, 735], [120, 700], [230, 690], [340, 722], [460, 760], [600, 772], [720, 748], [820, 726], [900, 738], [1000, 770], [1120, 790],
        [1240, 776], [1360, 740], [1470, 700], [1560, 676], [1650, 690], [1760, 730], [1860, 720], [1920, 740]],
    23, 4,
);

const SHRINE =
    "M-9,0L-9,-4L-6,-4L-6,-14L-12.5,-14L-15,-15.5Q-9,-16.5 -6.5,-21L6.5,-21Q9,-16.5 15,-15.5L12.5,-14L6,-14L6,-4L9,-4L9,0Z" +
    "M-4.5,-21L-4.5,-28L-9.5,-28L-12,-29.3Q-6.5,-30.5 -4,-35L4,-35Q6.5,-30.5 12,-29.3L9.5,-28L4.5,-28L4.5,-21Z" +
    "M-0.6,-35L-0.6,-47L0.6,-47L0.6,-35Z";

/**
 * The hills' woods: a treeline of small crowns and the odd fir along the crest (it gives the range its scale),
 * and hazed clumps of autumn canopy down the slope, a few of them caught by the valley's light.
 */
const WOODS = (() => {
    const rand = rng(29);
    let line = "";
    for (let x = -10; x < 1930;) {
        const y = yAt(MID_FAR, x);
        const r = 4 + rand() * 4.5;
        line += rand() < 0.26 ? `M${pt(x - r * 0.7, y + 3)}L${pt(x, y - r * 2.5)}L${pt(x + r * 0.7, y + 3)}Z` : dot(x, y - r * 0.3, r);
        x += r * (0.9 + rand() * 1.1);
    }
    let shade = "";
    let lit = "";
    for (let g = 0; g < 16; g++) {
        const gx = 60 + g * 118 + rand() * 60;
        const bright = rand() < 0.45;
        for (let k = 0; k < 7; k++) {
            const x = gx + (rand() - 0.5) * 120;
            const r = 4 + rand() * 5;
            const clump = dot(x, yAt(MID_FAR, x) + 8 + rand() * rand() * 60, r * 1.6, r * 0.7);
            if (bright && k % 2) lit += clump;
            else shade += clump;
        }
    }
    return { line, shade, lit };
})();

const MIST_PUFFS: readonly (readonly [number, number, number, number])[] = [
    [240, 62, 340, 28], [760, 70, 360, 32], [1260, 70, 340, 32], [1720, 60, 320, 26],
];

export function LoadingMountains() {
    return (
        <>
            <div className="ls-layer ls-par ls-par-far">
                <svg className="ls-layer" viewBox="0 0 1920 1080">
                    {/* Depth of field is baked: the furthest range is softest, the mountains slightly soft, the wooded hills crisp.
                        Between each pair hangs the last of the sunset, so every range dissolves into the one behind it. */}
                    <g filter="url(#ls-blur-distant)">
                        <path d={DISTANT_D} fill="url(#ls-distant)" />
                        <g className="ls-key" fill="url(#ls-face-lit)" opacity=".6">
                            {DISTANT_FACES.map((f) => <path key={f.lit} d={f.lit} />)}
                        </g>
                        <path className="ls-key" d={DISTANT_D} fill="url(#ls-moonlight)" opacity=".6" />
                        <path d={DISTANT_RIM} fill="none" stroke="var(--loading-rim)" strokeWidth="1.5" strokeLinecap="round" opacity=".16" />
                    </g>
                    <g transform={`translate(420 ${n1(yAt(DISTANT, 420) + 1)})`}>
                        <path d={SHRINE} fill="var(--ls-shrine)" />
                        <circle cy="-9" r="7" fill="url(#ls-bulb-glow)" />
                        <circle cy="-9" r="1.4" fill="var(--loading-flame-mid)" />
                    </g>
                    <rect y="540" width="1920" height="260" fill="url(#ls-haze-far)" />
                    <g filter="url(#ls-blur-ridge)">
                        <path d={ridge(FAR)} fill="url(#mountain-back-1)" />
                        <g fill="url(#ls-face-shade)">
                            {FAR_FACES.map((f) => <path key={f.shade} d={f.shade} />)}
                        </g>
                        <g className="ls-key" fill="url(#ls-face-lit)">
                            {FAR_FACES.map((f) => <path key={f.lit} d={f.lit} />)}
                        </g>
                        <path className="ls-key" d={ridge(FAR)} fill="url(#ls-moonlight)" opacity=".8" />
                        {/* Winter: snow on every summit, brighter on the moon side */}
                        <g className="ls-winter" fill="url(#ls-snow-face)">
                            {FAR_FACES.map((f) => <path key={f.lit} d={f.lit} />)}
                            {FAR_FACES.map((f) => <path key={f.shade} d={f.shade} opacity=".4" />)}
                        </g>
                    </g>
                    <rect y="620" width="1920" height="240" fill="url(#ls-haze-near)" />
                    <g filter="url(#ls-blur-midfar)">
                        <path className="ls-crowns" d={WOODS.line} fill="url(#mountain-back-2)" />
                        <path d={ridge(MID_FAR)} fill="url(#mountain-back-2)" />
                        <g className="ls-crowns">
                            <path d={WOODS.shade} fill="var(--ls-canopy)" opacity=".4" />
                            <path d={WOODS.lit} fill="var(--ls-crown-lit)" opacity=".16" />
                        </g>
                        <path className="ls-key" d={ridge(MID_FAR)} fill="url(#ls-moonlight)" opacity=".7" />
                        <path className="ls-winter" d={ridge(MID_FAR)} fill="url(#ls-snow-hill)" />
                    </g>
                </svg>
            </div>

            <div className="ls-mist ls-mist-far">
                <div className="ls-band" style={cssVars({ "--dur": "960s", "--delay": "-410s" })}>
                    <svg viewBox="0 0 3840 130" preserveAspectRatio="none">
                        <g id="ls-mist-far-tile">
                            <rect width="1920" height="130" fill="url(#ls-mist-v-far)" opacity=".16" />
                            {MIST_PUFFS.map(([cx, cy, rx, ry]) => (
                                <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#ls-mist-puff-far)" opacity=".14" />
                            ))}
                        </g>
                        <use href="#ls-mist-far-tile" x="-1920" />
                        <use href="#ls-mist-far-tile" x="1920" />
                        <use href="#ls-mist-far-tile" x="3840" />
                    </svg>
                </div>
            </div>
        </>
    );
}
