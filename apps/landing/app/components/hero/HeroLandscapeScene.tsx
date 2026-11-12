import { cssVars, n1, polyline, pt, risingEdges, rng, smoothThrough, yAt, type Pt } from "~/lib/geometry";

/*
 * The ground under the sky, on a 1920×300 band anchored to the bottom of the
 * hero (`xMidYMax slice`, so phones keep the centre: the river bend and the
 * hamlet). Back to front: a ghost range, two rock massifs standing either side
 * of an open valley (the moon is upper-left, so every summit splits into a lit
 * west face and a shaded east one, with cloud lying across their flanks), the
 * far ridge, a river that catches the moon on its far reach and the lamps on
 * its near bend, the mid ridge with a lone farm, a terrace holding the hamlet
 * among its trees, then the dark near hills. Aerial perspective does the
 * depth: each nearer layer is darker and crisper, and every ridge base
 * dissolves into haze. Nothing stands on a ridge line: woods rise out of a
 * canopy mound, houses are sunk into their ground and framed by trees. The
 * lights live in a sibling <svg>, so their flicker never repaints the hills.
 */

const W = 1920;
const H = 300;

export const ridgeLine = (keys: readonly Pt[]) => smoothThrough(keys, 10);
/* Closed a little below the band: the band sits at a fractional pixel offset, and a fill that ended exactly on
   its bottom edge left a half-transparent last row, a hairline of sky under the hills */
export const ridgeFill = (line: readonly Pt[]) => `${polyline(line)}L${W},${H + 2}L0,${H + 2}Z`;
/** A ridge that spans only part of the band, closed straight down past its bottom edge. */
export const bankFill = (line: readonly Pt[]) => `${polyline(line)}L${line[line.length - 1][0]},${H + 2}L${line[0][0]},${H + 2}Z`;
/** The band, for the journey's second valley (journey/FinaleLand), which is drawn with these same helpers. */
export { W as LAND_W, H as LAND_H };

/** Rock: runs between hand-placed keys, broken every dozen units by a small jitter, so a slope reads as stone. */
function crag(keys: readonly Pt[], seed: number): Pt[] {
  const rand = rng(seed);
  const out: Pt[] = [keys[0]];
  for (let i = 1; i < keys.length; i++) {
    const [x0, y0] = keys[i - 1];
    const [x1, y1] = keys[i];
    const n = Math.max(1, Math.round((x1 - x0) / 13));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + (k < n ? (rand() - 0.5) * 2.2 : 0)]);
    }
  }
  // A curve through the broken points: weathered rock, not cut paper
  return smoothThrough(out, 4);
}

/** The farthest thing in the picture: one pale massif seen through the gap, barely darker than the sky. */
const GHOST = ridgeLine([
  [0, 112], [170, 100], [320, 108], [480, 92], [610, 72], [700, 60], [770, 70], [880, 94], [1010, 86],
  [1120, 68], [1180, 62], [1260, 80], [1380, 100], [1540, 94], [1700, 82], [1820, 72], [1920, 84],
]);
/** Two massifs with an open valley between them (the centre stays low: the hero's buttons sit above it). */
const PEAKS = crag([
  [0, 132], [70, 120], [128, 100], [172, 94], [214, 70], [248, 62], [284, 40], [318, 20], [344, 38],
  [372, 52], [402, 48], [440, 78], [492, 98], [548, 112], [610, 122], [668, 130], [726, 120], [776, 104],
  [816, 94], [850, 86], [882, 96], [934, 112], [996, 126], [1062, 132], [1132, 122], [1198, 106],
  [1248, 98], [1290, 76], [1330, 60], [1362, 50], [1394, 26], [1420, 10], [1446, 26], [1472, 32],
  [1500, 46], [1534, 36], [1570, 58], [1612, 78], [1662, 92], [1720, 84], [1768, 68], [1810, 82],
  [1862, 100], [1920, 108],
], 41);
const FAR = ridgeLine([
  [0, 136], [120, 124], [260, 116], [400, 134], [520, 144], [660, 126], [780, 132], [900, 152],
  [1040, 138], [1160, 126], [1300, 146], [1420, 132], [1540, 116], [1680, 128], [1800, 140], [1920, 120],
]);
const MID = ridgeLine([
  [0, 178], [180, 166], [380, 192], [600, 172], [820, 200], [1000, 186], [1200, 202],
  [1420, 178], [1640, 198], [1920, 174],
]);
/** The terrace the hamlet stands on: right of the river bend, clear of the scroll cue, inside a phone's crop. */
const TERRACE = ridgeLine([
  [940, 300], [984, 246], [1036, 228], [1110, 220], [1200, 217], [1290, 221], [1372, 232], [1452, 252], [1530, 300],
]);
const NEAR = ridgeLine([
  [0, 236], [200, 226], [440, 248], [640, 242], [820, 256], [960, 268], [1110, 266], [1260, 260],
  [1440, 250], [1660, 232], [1800, 240], [1920, 232],
]);

/*
 * A summit's two faces. A spur zigzags down from the peak, leaning east; west of it the rock takes the moon,
 * east of it lies in shadow. Each face runs along the skyline to the next saddle (`west`, `east`; 0 leaves that
 * side to a taller neighbour), then closes straight back to the spur's foot, down in the haze where its gradient has faded.
 */
const FOOT = 176;
const lineTo = (points: readonly Pt[]) => points.map(([x, y]) => `L${pt(x, y)}`).join("");
function faces(line: readonly Pt[], sx: number, west: number, east: number, lean: number, seed: number) {
  const rand = rng(seed);
  const [px, py] = line.reduce((best, p) => (Math.abs(p[0] - sx) < Math.abs(best[0] - sx) ? p : best));
  const n = Math.max(3, Math.round((FOOT - py) / 15));
  const bends: Pt[] = [[px, py]];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    bends.push([px + lean * t + (k < n ? (k % 2 ? 1 : -0.6) * (2 + rand() * 4) * (0.4 + t) : 0), py + (FOOT - py) * t]);
  }
  // Foot back up to the summit, eased through its bends
  const spur = lineTo(smoothThrough(bends, 4).slice(1).reverse());
  const face = (side: readonly Pt[]) =>
    side.length ? `M${pt(px, py)}${lineTo(side)}${spur}Z` : "";
  return {
    lit: face(line.filter(([x]) => x < px && x >= px - west).reverse()),
    shade: face(line.filter(([x]) => x > px && x <= px + east)),
  };
}

/** A rib on a moonlit face: a thin wedge of shadow falling east from the skyline, the way a gully holds the dark. */
function rib(line: readonly Pt[], x: number, len: number, seed: number): string {
  const rand = rng(seed);
  const y = yAt(line, x);
  const steps = 4;
  const edge = (k: number, wide: number): Pt => {
    const t = k / steps;
    return [x + len * 0.5 * t + (k % 2 ? 3 : -2) * rand() + wide * t, y + len * t];
  };
  const down = Array.from({ length: steps }, (_, k) => edge(k + 1, len * 0.3));
  const up = Array.from({ length: steps - 1 }, (_, k) => edge(steps - 1 - k, 0));
  return `M${pt(x, y)}${lineTo(down)}${lineTo(up)}Z`;
}

/** Summits and shoulders, west to east: [x, west reach, east reach, lean, seed]. Each reach ends in a saddle. */
const FACES = ([
  [318, 250, 350, 44, 5], [402, 30, 0, 18, 9], [850, 182, 212, 26, 11],
  [1420, 358, 242, 50, 21], [1534, 34, 0, 22, 25], [1768, 106, 152, 28, 27],
] as const).map(([x, west, east, lean, seed]) => faces(PEAKS, x, west, east, lean, seed));
const PEAKS_LIT = FACES.map((f) => f.lit).join("");
const PEAKS_SHADE =
  FACES.map((f) => f.shade).join("") +
  rib(PEAKS, 150, 46, 2) + rib(PEAKS, 232, 58, 4) + rib(PEAKS, 776, 30, 6) +
  rib(PEAKS, 1210, 40, 8) + rib(PEAKS, 1300, 60, 10) + rib(PEAKS, 1366, 70, 12) + rib(PEAKS, 1700, 44, 14);

/** A soft spruce: two gentle bulges and a rounded tip, no hard tiers. */
function spruce(x: number, b: number, h: number, w: number): string {
  return (
    `M${pt(x - w, b)}Q${pt(x - w * 0.62, b - h * 0.3)} ${pt(x - w * 0.4, b - h * 0.55)}` +
    `Q${pt(x - w * 0.26, b - h * 0.82)} ${pt(x, b - h)}Q${pt(x + w * 0.26, b - h * 0.82)} ${pt(x + w * 0.4, b - h * 0.55)}` +
    `Q${pt(x + w * 0.62, b - h * 0.3)} ${pt(x + w, b)}Z`
  );
}

/** A fir seen close: three drooping tiers, for the trees big enough to show their boughs. */
function fir(x: number, b: number, h: number, w: number): string {
  let left = "";
  let right = "";
  for (let i = 0; i < 3; i++) {
    const out = w * (1 - i * 0.26);
    const tuck = w * (0.46 - i * 0.12);
    const y = b - h * i * 0.27;
    left += `L${pt(x - out, y)}Q${pt(x - out * 0.6, y - h * 0.1)} ${pt(x - tuck, y - h * 0.25)}`;
    right = `L${pt(x + tuck, y - h * 0.25)}Q${pt(x + out * 0.6, y - h * 0.1)} ${pt(x + out, y)}` + right;
  }
  return `M${pt(x, b)}${left}L${pt(x, b - h)}${right}Z`;
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
    const w = h * (0.34 + rand() * 0.08);
    d += rand() < 0.4 ? canopy(x, b, h * 0.8) : h > 36 ? fir(x, b, h, w) : spruce(x, b, h, w);
  }
  return d;
}

/** Lone trees along a ridge, between the woods: a land that grew, not one that was planted in clumps. */
export function scatter(line: readonly Pt[], x0: number, x1: number, count: number, h: number, seed: number): string {
  const rand = rng(seed);
  let d = "";
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * rand();
    const th = h * (0.6 + rand() * 0.5);
    d += rand() < 0.35 ? canopy(x, yAt(line, x) + 3, th * 0.8) : spruce(x, yAt(line, x) + 3, th, th * 0.36);
  }
  return d;
}

/** A house: walls under a gable with eaves, its windows set in the wall facing us. */
export interface House { body: string; windows: Pt[]; ridge: string; chimney?: Pt }

export function house(line: readonly Pt[], x: number, w: number, h: number, sink: number, panes: number): House {
  const b = yAt(line, x) + 6 + sink;
  const top = b - h;
  const roof = top - h * 0.6;
  const eave = w / 2 + 2.5;
  const windows: Pt[] = [];
  for (let i = 0; i < panes; i++) {
    // Evenly spaced across the wall, a third of the way down it
    windows.push([n1(x + w * ((i + 0.5) / panes - 0.5)), n1(top + h * 0.38)]);
  }
  return {
    body: `M${pt(x - w / 2, b)}L${pt(x - w / 2, top)}L${pt(x - eave, top)}L${pt(x, roof)}L${pt(x + eave, top)}L${pt(x + w / 2, top)}L${pt(x + w / 2, b)}Z`,
    // The moon catches one slope of every roof, as it catches the ridges
    ridge: `M${pt(x - eave, top)}L${pt(x, roof)}`,
    windows,
    chimney: h >= 18 ? [n1(x + w * 0.26), n1(roof + h * 0.22)] : undefined,
  };
}

const FAR_TREES =
  grove(FAR, 250, 14, 200, 10, 43) + grove(FAR, 1170, 12, 170, 9, 47) + grove(FAR, 1560, 16, 230, 11, 53) +
  scatter(FAR, 560, 860, 9, 7, 59);
const MID_TREES =
  grove(MID, 150, 20, 210, 18, 7) + grove(MID, 640, 12, 130, 15, 13) +
  grove(MID, 1430, 22, 230, 19, 17) + grove(MID, 1800, 16, 170, 16, 19) +
  scatter(MID, 300, 480, 5, 12, 61) + scatter(MID, 1020, 1280, 7, 12, 67);
/* The hamlet's own trees: taller than its roofs behind and beside them, so the houses sit in a wood's lap */
const TERRACE_TREES =
  grove(TERRACE, 1030, 5, 46, 26, 31) + grove(TERRACE, 1166, 5, 76, 34, 71) + grove(TERRACE, 1330, 7, 80, 30, 37) +
  scatter(TERRACE, 1214, 1262, 2, 26, 73);
/* The near hills carry the biggest trees, largest at the picture's edges: scale is the last depth cue */
const NEAR_TREES =
  grove(NEAR, 70, 9, 190, 58, 23) + grove(NEAR, 330, 10, 170, 30, 79) + grove(NEAR, 1600, 12, 210, 34, 29) +
  grove(NEAR, 1860, 8, 170, 54, 83) + scatter(NEAR, 520, 900, 6, 17, 89) + scatter(NEAR, 1380, 1480, 3, 18, 97);

/** The hamlet: six homes staggered in depth around one larger house. */
const HAMLET = [
  house(TERRACE, 1066, 22, 12, 4, 1), house(TERRACE, 1102, 32, 17, 0, 2), house(TERRACE, 1146, 24, 13, 6, 1),
  house(TERRACE, 1192, 38, 20, 1, 2), house(TERRACE, 1240, 26, 14, 6, 1), house(TERRACE, 1276, 20, 11, 2, 1),
];
/** A lone farm on the mid ridge across the river: someone else is home too. */
const FARM = house(MID, 556, 20, 10, 3, 1);

/** The river. Its far reach lies across the valley under the moon; its near bend comes round the terrace toward us. */
const RIVER_FAR = "M236,165Q330,158 430,160T612,163Q700,165 772,172L772,175Q690,170 612,169T430,167Q330,166 236,169Z";
const RIVER_NEAR = "M520,207C650,203 770,206 852,219S944,250 950,290L1024,290C1016,256 976,230 904,215S660,209 520,210Z";
/** Moonlight broken on the far reach, straight under the moon; a few ripples on the near bend. */
const GLITTER = "M352,161.5H392M404,163.5H452M372,165.5H424M438,161.5H470M462,165H500M318,164H342";
const RIPPLES = "M700,208.5H770M812,216H868M880,228H930M908,240H966M934,252H990";

/** Lanterns down the lane from the hamlet to the water, and one at a wayside on the eastern slope. */
const LANE: readonly Pt[] = [
  [1020, 237],
  [977, 251],
];
const WAYSIDE: Pt = [1392, yAt(MID, 1392) + 9];

/** A lone light on the tallest summit (the finale lights the same one from the other side). */
export const BEACON: Pt = [1420, 8];

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

/**
 * The valley's mountains, one drawing for both ends of the page: the ghost range, the two massifs with their
 * moonlit and shaded faces, and a little cloud across their flanks. The hero sees them with the moon in the
 * west; `flip` is the same range from the valley's other end (the finale), where the moon has crossed to the
 * east, so the lit faces turn with it. `cloud` scales how much of the cloud shows.
 */
export function Massifs({ id, rim, flip, cloud = 1 }: { id: string; rim?: string; flip?: boolean; cloud?: number }) {
  return (
    <g transform={flip ? `translate(${W}) scale(-1 1)` : undefined}>
      <defs>
        <Grad id={`${id}-ghost`} top="color-mix(in srgb, var(--hero-land-distant) 55%, var(--hero-land-haze))" base="var(--hero-land-haze)" />
        <Grad id={`${id}-distant`} top="var(--hero-land-distant)" base="var(--hero-land-haze)" />
        {/* The faces fade by height, not by shape, so every summit loses its light and shadow at the same haze line */}
        <linearGradient id={`${id}-lit`} gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="0" y2="134">
          <stop offset="0" stopColor="var(--hero-land-rim)" stopOpacity=".3" />
          <stop offset="1" stopColor="var(--hero-land-rim)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-shade`} gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="0" y2="134">
          <stop offset="0" stopColor="var(--hero-land-mid)" stopOpacity=".6" />
          <stop offset="1" stopColor="var(--hero-land-mid)" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-5%" y="-20%" width="110%" height="140%">
          <feGaussianBlur stdDeviation="1" />
        </filter>
        <filter id={`${id}-cloud`} x="-30%" y="-200%" width="160%" height="500%">
          <feGaussianBlur stdDeviation="34 9" />
        </filter>
      </defs>
      <path d={ridgeFill(GHOST)} fill={`url(#${id}-ghost)`} opacity=".5" filter={`url(#${id}-soft)`} />
      {/* Softest and palest of the solid land, each summit split by the moon */}
      <g filter={`url(#${id}-soft)`}>
        <path d={ridgeFill(PEAKS)} fill={`url(#${id}-distant)`} />
        <path d={PEAKS_SHADE} fill={`url(#${id}-shade)`} />
        <path className={rim} d={PEAKS_LIT} fill={`url(#${id}-lit)`} />
        <path className={rim} d={risingEdges(PEAKS)} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity=".34" />
      </g>
      <g filter={`url(#${id}-cloud)`} fill="color-mix(in srgb, var(--hero-land-haze) 45%, var(--hero-land-distant))" opacity={cloud}>
        <ellipse cx="300" cy="100" rx="270" ry="13" opacity=".34" />
        <ellipse cx="1470" cy="92" rx="300" ry="14" opacity=".34" />
        <ellipse cx="900" cy="118" rx="320" ry="13" opacity=".3" />
      </g>
    </g>
  );
}

/** A lit window: a small pane of warm light in its own spill. */
function Pane({ at, x, y }: { at: number; x: number; y: number }) {
  return (
    <g className="hero-lamp" style={cssVars({ "--at": `${at}ms` })}>
      <circle cx={x} cy={y + 1} r="8" fill="url(#hl-lamp)" />
      <rect x={n1(x - 1.6)} y={n1(y - 1.2)} width="3.2" height="3.8" rx=".5" fill="var(--hero-lamp)" />
    </g>
  );
}

export function LandLayers() {
  return (
    <>
      <svg {...BAND}>
        <defs>
          <Grad id="hl-far" top="var(--hero-land-far)" base="var(--hero-land-haze)" />
          <Grad id="hl-mid" top="var(--hero-land-mid)" base="var(--hero-land-far)" />
          <Grad id="hl-terrace" top="color-mix(in srgb, var(--hero-land-near) 70%, var(--hero-land-mid))" base="var(--hero-land-near)" />
          <Grad id="hl-near" top="var(--hero-land-near)" base="var(--color-twilight-void)" />
          <Mist id="hl-mist" color="var(--hero-land-haze)" />
          <Mist id="hl-fog" color="var(--hero-land-mid)" />
          <linearGradient id="hl-water" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--hero-land-water)" stopOpacity=".1" />
            <stop offset=".4" stopColor="var(--hero-land-water)" stopOpacity=".6" />
            <stop offset="1" stopColor="var(--hero-land-water)" stopOpacity=".15" />
          </linearGradient>
          <Grad id="hl-bend" top="color-mix(in srgb, var(--hero-land-water) 55%, var(--hero-land-mid))" base="var(--hero-land-mid)" />
          <radialGradient id="hl-moonwash">
            <stop offset="0" stopColor="var(--hero-moon-halo)" stopOpacity=".16" />
            <stop offset="1" stopColor="var(--hero-moon-halo)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hl-village">
            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".22" />
            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hl-streak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".5" />
            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
          </linearGradient>
          <filter id="hl-haze" x="-20%" y="-150%" width="140%" height="400%">
            <feGaussianBlur stdDeviation="7 3" />
          </filter>
        </defs>

        <Massifs id="hl" rim="hero-land-rim" />
        {/* The moon's wash on the haze beneath it */}
        <ellipse cx="430" cy="128" rx="330" ry="58" fill="url(#hl-moonwash)" />

        <path d={ridgeFill(FAR) + FAR_TREES} fill="url(#hl-far)" />
        <path className="hero-land-rim" d={risingEdges(FAR)} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1.2" strokeLinecap="round" opacity=".2" />
        <rect y="124" width={W} height="80" fill="url(#hl-mist)" />

        {/* The river's far reach, silvered where the moon stands over it */}
        <path d={RIVER_FAR} fill="url(#hl-water)" />
        <path className="hero-land-rim" d={GLITTER} stroke="var(--hero-moon)" strokeWidth="1" strokeLinecap="round" opacity=".55" />

        <path d={ridgeFill(MID) + MID_TREES + FARM.body} fill="url(#hl-mid)" />
        <path className="hero-land-rim" d={risingEdges(MID)} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1" strokeLinecap="round" opacity=".14" />
        {/* Haze over the tree line, so the woods sink into the slope, and a bank of it pooled in each hollow */}
        <rect y="176" width={W} height="70" fill="url(#hl-mist)" opacity=".7" />
        <g filter="url(#hl-haze)" fill="var(--hero-land-haze)">
          <ellipse cx="330" cy="212" rx="250" ry="6" opacity=".3" />
          <ellipse cx="1560" cy="218" rx="270" ry="6" opacity=".3" />
        </g>

        {/* The near bend, coming round the terrace: it carries the lane's lamps on its surface */}
        <path d={RIVER_NEAR} fill="url(#hl-bend)" opacity=".8" />
        <path className="hero-land-rim" d={RIPPLES} stroke="var(--hero-land-rim)" strokeWidth=".8" strokeLinecap="round" opacity=".28" />

        {/* The hamlet and its light, one group: portrait screens set it lower, under the bough that hangs there (hero.css) */}
        <g className="hero-hamlet">
          {/* The hamlet's light spills over the valley behind it once it wakes, backlighting the roofs */}
          <ellipse className="hero-land-glow" cx="1166" cy="212" rx="240" ry="64" fill="url(#hl-village)" />

          <path d={bankFill(TERRACE) + TERRACE_TREES + HAMLET.map((c) => c.body).join("")} fill="url(#hl-terrace)" />
          <path className="hero-land-rim" d={HAMLET.map((c) => c.ridge).join("")} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1" strokeLinecap="round" opacity=".32" />
          {/* What the lamps do to the ground: a pool round the homes, the lane's last lamp on the water */}
          <g className="hero-land-glow">
            <ellipse cx="1170" cy="234" rx="160" ry="28" fill="url(#hl-village)" />
            <rect x="969" y="255" width="3" height="13" rx="1.5" fill="url(#hl-streak)" />
          </g>
        </g>

        <path d={ridgeFill(NEAR) + NEAR_TREES} fill="url(#hl-near)" />
        <rect y="226" width={W} height="60" fill="url(#hl-fog)" opacity=".45" />
      </svg>

      <svg {...BAND} className="hero-lamps">
        <defs>
          <radialGradient id="hl-lamp">
            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <Light at={1560} x={BEACON[0]} y={BEACON[1]} r={1.3} />
        <Light at={1620} x={FARM.windows[0][0]} y={FARM.windows[0][1] + 1} r={1.2} />
        <Light at={1660} x={WAYSIDE[0]} y={WAYSIDE[1]} r={1.4} />
        <g className="hero-hamlet">
          {LANE.map(([x, y], i) => (
            <Light key={x} at={1720 + i * 60} x={x} y={y} r={1.4} />
          ))}
          {HAMLET.flatMap((c, i) => c.windows.map(([x, y]) => <Pane key={x} at={1820 + i * 60} x={x} y={y} />))}
        </g>
      </svg>
    </>
  );
}
