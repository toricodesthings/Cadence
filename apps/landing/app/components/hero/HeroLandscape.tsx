import { cssVars, n1, polyline, pt, risingEdges, rng, smoothThrough, yAt, type Pt } from "~/lib/geometry";

/*
 * The ground under the sky, on a 1920×300 band anchored to the bottom of the
 * hero (`xMidYMax slice`, so phones keep the centre: the village). Back to
 * front: hazy fantasy spires with a light on the tallest, the far ridge, mist,
 * the mid ridge and its woods, the near hills with a small village, then a
 * knoll and valley fog in front of it. Aerial perspective does the depth: each
 * nearer layer is darker and crisper, and every ridge base dissolves into
 * haze. Nothing stands on a ridge line: woods rise out of a canopy mound,
 * cottages are sunk behind a knoll and framed by trees, and all of it shares
 * its ridge's fill, so it reads as one land backlit by the village glow. The
 * lights live in a sibling <svg>, so their flicker never repaints the hills.
 */

const W = 1920;
const H = 300;

export const ridgeLine = (keys: readonly Pt[]) => smoothThrough(keys, 10);
/* Closed a little below the band: the band sits at a fractional pixel offset, and a fill that ended exactly on
   its bottom edge left a half-transparent last row, a hairline of sky under the hills */
export const ridgeFill = (line: readonly Pt[]) => `${polyline(line)}L${W},${H + 2}L0,${H + 2}Z`;
/** The band, for the journey's second valley (journey/FinaleLand), which is drawn with these same helpers. */
export { W as LAND_W, H as LAND_H };

const DISTANT = ridgeLine([
  [0, 150], [140, 120], [260, 82], [330, 50], [380, 68], [470, 104], [600, 124], [760, 110],
  [840, 84], [900, 96], [1020, 126], [1180, 118], [1300, 88], [1390, 52], [1440, 38],
  [1500, 64], [1600, 100], [1760, 92], [1920, 120],
]);
const FAR = ridgeLine([
  [0, 130], [200, 110], [420, 138], [640, 118], [860, 150], [1080, 124], [1300, 148],
  [1520, 114], [1740, 138], [1920, 116],
]);
const MID = ridgeLine([
  [0, 178], [180, 166], [380, 192], [600, 172], [820, 200], [1000, 182], [1200, 206],
  [1420, 178], [1640, 200], [1920, 174],
]);
const NEAR = ridgeLine([
  [0, 240], [220, 228], [480, 248], [760, 232], [960, 254], [1180, 234], [1460, 252],
  [1700, 230], [1920, 246],
]);
/** A low knoll in front of the village, hiding the cottages' footings. */
const KNOLL = ridgeLine([
  [880, 320], [980, 268], [1080, 250], [1170, 246], [1260, 254], [1340, 276], [1420, 320],
]);

/** A soft spruce: two gentle bulges and a rounded tip, no hard tiers. */
function spruce(x: number, b: number, h: number, w: number): string {
  return (
    `M${pt(x - w, b)}Q${pt(x - w * 0.62, b - h * 0.3)} ${pt(x - w * 0.4, b - h * 0.55)}` +
    `Q${pt(x - w * 0.26, b - h * 0.82)} ${pt(x, b - h)}Q${pt(x + w * 0.26, b - h * 0.82)} ${pt(x + w * 0.4, b - h * 0.55)}` +
    `Q${pt(x + w * 0.62, b - h * 0.3)} ${pt(x + w, b)}Z`
  );
}

/** A broadleaf crown: three overlapping discs, drawn clockwise like the ridges so overlaps never cut holes. */
function canopy(x: number, b: number, h: number): string {
  const disc = (cx: number, cy: number, r: number) =>
    `M${pt(cx - r, cy)}a${n1(r)},${n1(r)} 0 1,1 ${n1(2 * r)},0a${n1(r)},${n1(r)} 0 1,1 ${n1(-2 * r)},0Z`;
  const r = h * 0.34;
  return disc(x, b - h + r, r) + disc(x - r * 0.7, b - r * 0.8, r * 0.8) + disc(x + r * 0.75, b - r * 0.75, r * 0.78);
}

/**
 * A wood on a ridge: a low canopy mound (closed back along the ridge itself, so
 * no sky shows beneath it) with overlapping spruces and broadleaf crowns rising
 * out of it, tallest near the middle, so the clump reads as one mass instead of
 * a row of spikes.
 */
export function grove(line: readonly Pt[], cx: number, count: number, spread: number, hMax: number, seed: number): string {
  const rand = rng(seed);
  const x0 = cx - spread * 0.6;
  const x1 = cx + spread * 0.6;
  const under = line.filter(([x]) => x > x0 && x < x1).reverse();
  let d =
    `M${pt(x0, yAt(line, x0) + 6)}Q${pt(cx, yAt(line, cx) - hMax * 0.6)} ${pt(x1, yAt(line, x1) + 6)}` +
    under.map(([x, y]) => `L${pt(x, y + 6)}`).join("") +
    "Z";
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count - 0.5 + (rand() - 0.5) * 0.18;
    const x = cx + u * spread;
    const bell = 1 - Math.abs(u) * 1.3;
    const h = hMax * (0.45 + 0.55 * bell) * (0.85 + rand() * 0.3);
    const b = yAt(line, x) + 4 - hMax * 0.18 * bell;
    d += rand() < 0.4 ? canopy(x, b, h * 0.8) : spruce(x, b, h, h * (0.34 + rand() * 0.08));
  }
  return d;
}

const MID_TREES =
  grove(MID, 150, 20, 210, 18, 7) + grove(MID, 610, 16, 160, 15, 13) +
  grove(MID, 1430, 22, 230, 19, 17) + grove(MID, 1800, 16, 170, 16, 19);
const NEAR_TREES =
  grove(NEAR, 150, 18, 250, 30, 23) + grove(NEAR, 1640, 16, 230, 32, 29) +
  // A few trees framing the village on both sides
  grove(NEAR, 998, 5, 44, 22, 31) + grove(NEAR, 1266, 5, 48, 20, 37);

/**
 * Cottages in the near valley, right of centre (clear of the scroll cue, still
 * inside a phone's crop): [x, width, wall height, sink]. The sink staggers them
 * in depth, so they read as a hamlet rather than a row.
 */
const COTTAGES: readonly (readonly [number, number, number, number])[] = [
  [1042, 20, 9, 2], [1070, 26, 12, 6], [1108, 18, 9, 0], [1146, 28, 13, 5], [1184, 20, 10, 1], [1214, 16, 8, 4],
];

const VILLAGE = COTTAGES.map(([x, w, h, sink], i) => {
  const b = yAt(NEAR, x) + 6 + sink;
  const top = b - h;
  // Low-pitched roofs with a little eave, one chimney in the whole hamlet
  const roof = top - h * 0.6;
  const chimney = i === 3 ? `M${pt(x + w * 0.22, top - h * 0.3)}L${pt(x + w * 0.22, roof)}L${pt(x + w * 0.32, roof)}L${pt(x + w * 0.32, top - h * 0.42)}Z` : "";
  return {
    body: `M${pt(x - w / 2, b)}L${pt(x - w / 2, top)}L${pt(x - w / 2 - 2.5, top)}L${pt(x, roof)}L${pt(x + w / 2 + 2.5, top)}L${pt(x + w / 2, top)}L${pt(x + w / 2, b)}Z${chimney}`,
    window: [x + (i % 2 ? -w * 0.2 : w * 0.15), top + h * 0.34] as Pt,
  };
});

/** Lanterns on the mid slopes, either side of the village. */
const LANTERNS: readonly Pt[] = [
  [968, yAt(MID, 968) + 8],
  [1356, yAt(MID, 1356) + 8],
];

/** A lone light on the tallest spire's summit. */
const BEACON: Pt = [1440, 35];

const BAND = { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMax slice", "aria-hidden": true, focusable: "false" } as const;

export function Grad({ id, top, base }: { id: string; top: string; base: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={top} />
      <stop offset="1" stopColor={base} />
    </linearGradient>
  );
}

/** A band of haze: clear at both edges, densest just below the middle. */
export function Mist({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={color} stopOpacity="0" />
      <stop offset=".55" stopColor={color} stopOpacity=".55" />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </linearGradient>
  );
}

/** A warm light: a soft glow and a bright core, lit at its own moment of the ignition. */
function Light({ at, x, y, r = 1.6 }: { at: number; x: number; y: number; r?: number }) {
  return (
    <g className="hero-lamp" style={cssVars({ "--at": `${at}ms` })}>
      <circle cx={x} cy={y} r={r * 5.5} fill="url(#hl-lamp)" />
      <circle cx={x} cy={y} r={r} fill="var(--hero-lamp)" />
    </g>
  );
}

export function HeroLandscape() {
  return (
    <div className="hero-land" data-depth={3} data-axis="x" aria-hidden="true">
      <svg {...BAND}>
        <defs>
          <Grad id="hl-distant" top="var(--hero-land-distant)" base="var(--hero-land-haze)" />
          <Grad id="hl-far" top="var(--hero-land-far)" base="var(--hero-land-haze)" />
          <Grad id="hl-mid" top="var(--hero-land-mid)" base="var(--hero-land-far)" />
          <Grad id="hl-near" top="var(--hero-land-near)" base="var(--color-twilight-void)" />
          <Grad id="hl-knoll" top="color-mix(in srgb, var(--hero-land-near) 60%, var(--color-twilight-void))" base="var(--color-twilight-void)" />
          <Mist id="hl-mist" color="var(--hero-land-haze)" />
          <Mist id="hl-fog" color="var(--hero-land-mid)" />
          <radialGradient id="hl-village">
            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".2" />
            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
          </radialGradient>
          <filter id="hl-soft" x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation="1.3" />
          </filter>
        </defs>

        {/* Spires: softest and palest */}
        <g filter="url(#hl-soft)">
          <path d={ridgeFill(DISTANT)} fill="url(#hl-distant)" />
          <path d={risingEdges(DISTANT)} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1.4" strokeLinecap="round" opacity=".2" />
        </g>

        <path d={ridgeFill(FAR)} fill="url(#hl-far)" />
        <path className="hero-land-rim" d={risingEdges(FAR)} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1.2" strokeLinecap="round" opacity=".2" />
        <rect y="118" width={W} height="80" fill="url(#hl-mist)" />

        <path d={ridgeFill(MID) + MID_TREES} fill="url(#hl-mid)" />
        <path className="hero-land-rim" d={risingEdges(MID)} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1" strokeLinecap="round" opacity=".14" />
        {/* Haze over the tree line, so the woods sink into the slope */}
        <rect y="176" width={W} height="70" fill="url(#hl-mist)" opacity=".7" />

        {/* The village's light spills over the valley behind it once it wakes, backlighting the roofs */}
        <ellipse className="hero-land-glow" cx="1130" cy="236" rx="210" ry="58" fill="url(#hl-village)" />

        <path d={ridgeFill(NEAR) + NEAR_TREES + VILLAGE.map((c) => c.body).join("")} fill="url(#hl-near)" />
        <path d={ridgeFill(KNOLL)} fill="url(#hl-knoll)" />
        <rect y="222" width={W} height="60" fill="url(#hl-fog)" opacity=".5" />
      </svg>

      <svg {...BAND} className="hero-lamps">
        <defs>
          <radialGradient id="hl-lamp">
            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <Light at={1560} x={BEACON[0]} y={BEACON[1]} r={1.3} />
        {LANTERNS.map(([x, y], i) => (
          <Light key={x} at={1620 + i * 70} x={x} y={y} r={1.4} />
        ))}
        {VILLAGE.map(({ window: [x, y] }, i) => (
          <Light key={x} at={1760 + i * 60} x={x + 1.5} y={y + 1.5} r={1.5} />
        ))}
      </svg>
    </div>
  );
}
