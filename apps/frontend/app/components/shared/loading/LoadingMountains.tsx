import { cssVars, polyline, quadChain, risingEdges, sinR, smoothThrough, yAt, type Pt } from "./loading-geometry";

const ridge = (points: Pt[]) => `M0,1080L${polyline(points).slice(1)}L1920,1080Z`;

const FAR = quadChain([0, 650], [200, 550], [[400, 680], [800, 600], [1200, 700], [1600, 530], [1920, 720]], 12);
const MID_FAR = quadChain([0, 720], [150, 650], [[350, 780], [750, 700], [1150, 800], [1550, 660], [1920, 800]], 12);

const DISTANT = smoothThrough(
    [[220, 720], [300, 650], [372, 600], [420, 562], [470, 588], [540, 604], [612, 552], [690, 580], [770, 612], [880, 720]],
    8,
);
const DISTANT_D = `${polyline(DISTANT)}L880,760L220,760Z`;
const DISTANT_RIM = risingEdges(DISTANT);

const SHRINE =
    "M-9,0L-9,-4L-6,-4L-6,-14L-12.5,-14L-15,-15.5Q-9,-16.5 -6.5,-21L6.5,-21Q9,-16.5 15,-15.5L12.5,-14L6,-14L6,-4L9,-4L9,0Z" +
    "M-4.5,-21L-4.5,-28L-9.5,-28L-12,-29.3Q-6.5,-30.5 -4,-35L4,-35Q6.5,-30.5 12,-29.3L9.5,-28L4.5,-28L4.5,-21Z" +
    "M-0.6,-35L-0.6,-47L0.6,-47L0.6,-35Z";

/** A tonal band of hazed autumn woods just under the mid-far crest (never above it, so it reads as a slope, not a wire). */
const CANOPY = (() => {
    const top: Pt[] = [];
    const base: Pt[] = [];
    for (let x = 0; x <= 1920; x += 20) {
        const y = yAt(MID_FAR, x);
        top.push([x, y]);
        base.push([x, y + 20 + 4 * sinR(x / 110 + 0.8)]);
    }
    return `${polyline(top)}L${polyline(base.reverse()).slice(1)}Z`;
})();

/** Winter snow caps, fitted to the jagged peaks (far-left, tall right, mid-far right). */
const SNOW_CAPS = ([[FAR, 160, 250], [FAR, 1720, 1840], [MID_FAR, 1700, 1780]] as const)
    .map(([points, x0, x1]) => polyline(points.filter(([x]) => x >= x0 && x <= x1).map(([x, y]) => [x, y + 2] as const)))
    .join("");

const MIST_PUFFS: readonly (readonly [number, number, number, number])[] = [
    [240, 62, 340, 28], [760, 70, 360, 32], [1260, 70, 340, 32], [1720, 60, 320, 26],
];

export function LoadingMountains() {
    return (
        <>
            <svg className="ls-layer ls-par ls-par-far" viewBox="0 0 1920 1080">
                {/* Depth of field is baked: the furthest peaks are softest, the far ridge slightly soft, nearer ridges crisp */}
                <g filter="url(#ls-blur-distant)">
                    <path d={DISTANT_D} fill="url(#ls-distant)" />
                    <path className="ls-key" d={DISTANT_D} fill="url(#ls-moonlight)" opacity=".6" />
                    <path d={DISTANT_RIM} fill="none" stroke="var(--loading-rim)" strokeWidth="1.5" strokeLinecap="round" opacity=".2" />
                </g>
                <g transform="translate(420 561)">
                    <path d={SHRINE} fill="var(--ls-shrine)" />
                    <circle cy="-9" r="7" fill="url(#ls-bulb-glow)" />
                    <circle cy="-9" r="1.4" fill="var(--loading-flame-mid)" />
                </g>
                <g filter="url(#ls-blur-ridge)">
                    <path d={ridge(FAR)} fill="url(#mountain-back-1)" />
                    <path className="ls-key" d={ridge(FAR)} fill="url(#ls-moonlight)" opacity=".8" />
                </g>
                <g filter="url(#ls-blur-midfar)">
                    <path d={ridge(MID_FAR)} fill="url(#mountain-back-2)" />
                    <path className="ls-crowns" d={CANOPY} fill="var(--ls-canopy)" opacity=".6" />
                    <path className="ls-key" d={ridge(MID_FAR)} fill="url(#ls-moonlight)" opacity=".7" />
                </g>

                <path className="ls-winter" d={SNOW_CAPS} fill="none" stroke="var(--loading-particle-color)" strokeWidth="4" strokeLinejoin="round" opacity="0.45" />
            </svg>

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
