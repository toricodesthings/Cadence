import { Grad, LAND_H as H, LAND_W as W, Mist, grove, ridgeFill, ridgeLine } from "~/components/hero/HeroLandscape";
import { cssVars, n1, polyline, pt, risingEdges, yAt, type Pt } from "~/lib/geometry";

/*
 * The finale's valley: the hero's drawing language, another place, and the page's warmest picture. One summit
 * with a shrine light, a still lake in the middle distance holding the lights, the village on the west bank, a
 * hamlet of lit houses on the east (the loading screen's cottages: warm windows, a string of lights between the
 * eaves, smoke off two chimneys), and two lantern boats out on the water. Same band (1920×300, `xMidYMax slice`),
 * same aerial perspective and haze. The lamps wake one by one as the valley comes into view (on its own view
 * timeline, journey.css) in a sibling <svg>, so the flicker never repaints the hills; the boats drift, the smoke
 * rises and each reflection shimmers in a layer of its own, so nothing that moves shares a box with the hills.
 */

const SPIRES = ridgeLine([
  [0, 168], [180, 150], [330, 122], [430, 96], [500, 58], [548, 22], [596, 52], [680, 98], [820, 126],
  [1000, 118], [1160, 132], [1320, 112], [1450, 90], [1540, 104], [1720, 134], [1920, 120],
]);
const FAR = ridgeLine([
  [0, 150], [220, 132], [430, 158], [640, 140], [860, 166], [1080, 150], [1300, 168], [1520, 140], [1740, 160], [1920, 138],
]);
/** The mid hills stop at the water on either side of the lake. */
const MID_W = ridgeLine([[0, 186], [180, 176], [380, 192], [560, 188], [700, 200], [800, 214], [860, 234]]);
const MID_E = ridgeLine([[1100, 234], [1180, 212], [1300, 196], [1480, 184], [1680, 196], [1920, 180]]);
/** The water line: the lake covers everything under it between the banks. */
const WATER = 208;
const NEAR_W = ridgeLine([[0, 236], [160, 226], [360, 240], [520, 236], [660, 246], [760, 262], [820, 302]]);
const NEAR_E = ridgeLine([[1240, 302], [1300, 262], [1420, 244], [1600, 234], [1760, 246], [1920, 238]]);
const KNOLL = ridgeLine([[180, 320], [250, 268], [340, 252], [440, 256], [530, 272], [600, 320]]);

/** A ridge that spans only part of the band, closed straight down past its bottom edge. */
const bankFill = (line: readonly Pt[]) => `${polyline(line)}L${line[line.length - 1][0]},${H + 2}L${line[0][0]},${H + 2}Z`;

const MID_TREES = grove(MID_W, 210, 18, 220, 17, 61) + grove(MID_E, 1560, 20, 240, 18, 67);
const NEAR_TREES = grove(NEAR_W, 110, 14, 190, 28, 71) + grove(NEAR_W, 610, 5, 56, 21, 73) + grove(NEAR_E, 1700, 14, 200, 30, 79);

/** A house: walls under a gable with eaves, its windows set in the wall facing us. */
type House = { body: string; windows: Pt[]; ridge: string; chimney?: Pt };

function house(line: readonly Pt[], x: number, w: number, h: number, sink: number, panes: number): House {
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

/** The far village on the west bank: small, staggered in depth, seen across the water. */
const VILLAGE = [
  house(NEAR_W, 300, 20, 9, 2, 1), house(NEAR_W, 330, 26, 12, 5, 1), house(NEAR_W, 368, 18, 9, 0, 1),
  house(NEAR_W, 404, 28, 13, 4, 2), house(NEAR_W, 444, 20, 10, 1, 1), house(NEAR_W, 474, 16, 8, 3, 1),
];

/** The hamlet on the near east bank: the houses you could walk to, lit and lived in. */
const HAMLET = [
  house(NEAR_E, 1330, 30, 16, 2, 2), house(NEAR_E, 1390, 42, 22, 0, 3), house(NEAR_E, 1452, 28, 15, 4, 2),
  house(NEAR_E, 1512, 36, 19, 1, 2), house(NEAR_E, 1580, 24, 13, 5, 1),
];

const HOUSES = [...VILLAGE, ...HAMLET];

/**
 * The string of lights over the hamlet's lane: a sagging line between two eaves with bulbs along it.
 * Sampled from the quadratic through the sag, so the bulbs hang where the wire does.
 */
const STRING = { a: [1352, 246] as Pt, b: [1530, 240] as Pt, sag: 5 };
const STRING_WIRE = `M${pt(...STRING.a)}Q${pt((STRING.a[0] + STRING.b[0]) / 2, (STRING.a[1] + STRING.b[1]) / 2 + STRING.sag * 2)} ${pt(...STRING.b)}`;
const BULBS: Pt[] = Array.from({ length: 7 }, (_, i) => {
  const t = (i + 1) / 8;
  const u = 1 - t;
  const mid: Pt = [(STRING.a[0] + STRING.b[0]) / 2, (STRING.a[1] + STRING.b[1]) / 2 + STRING.sag * 2];
  return [
    n1(u * u * STRING.a[0] + 2 * u * t * mid[0] + t * t * STRING.b[0]),
    n1(u * u * STRING.a[1] + 2 * u * t * mid[1] + t * t * STRING.b[1] + 2),
  ];
});

/** The bulbs as the lamps layer can't hold them: each glimmers on its own clock, so each is an HTML box. */
const BULB_AT = BULBS.map(([x, y], k) => ({
  dx: n1(((x - W / 2) / W) * 100),
  b: n1(((H - y) / H) * 100),
  k,
}));

/** Shore lanterns, each just above the water on its own bank. */
const SHORE: readonly Pt[] = [
  [720, yAt(MID_W, 720) - 4],
  [1262, yAt(MID_E, 1262) - 4],
];
const SHRINE: Pt = [548, 26];

/** Every fixed light in the valley, in the order it wakes: [x, y, r]. The boats carry their own. */
const LIGHTS: readonly (readonly [number, number, number])[] = [
  [SHRINE[0], SHRINE[1], 1.3],
  ...VILLAGE.flatMap((c) => c.windows.map(([x, y]) => [x, y, 1.4] as const)),
  ...SHORE.map(([x, y]) => [x, y, 1.4] as const),
];

/** Where a light touches the water, its reflection: a soft streak straight down from the water line. */
const REFLECTIONS: readonly (readonly [number, number])[] = [
  [SHORE[0][0], 22],
  [SHORE[1][0], 22],
];

/** The two boats: [x, y, scale, the layer's class]. The near one is out under the moon, the far one upstream. */
const BOATS = [
  { x: 1011, y: 232, s: 1, cls: "fl-boat-near" },
  { x: 902, y: 222, s: 0.7, cls: "fl-boat-far" },
];

/**
 * Smoke off the hamlet's chimneys, in a CSS layer so the hills never repaint. Placed the way the band is
 * anchored (`xMidYMax`): out from the centre, up from the bottom edge, so it stays on its chimney as the
 * band crops.
 */
const SMOKE = HAMLET.filter((h) => h.chimney).map(({ chimney }, k) => ({
  dx: n1(((chimney![0] - W / 2) / W) * 100),
  b: n1(((H - chimney![1]) / H) * 100),
  k,
}));

const BAND = { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMax slice", "aria-hidden": true, focusable: "false" } as const;

export function FinaleLand() {
  return (
    <div className="finale-land" aria-hidden="true">
      <svg {...BAND}>
        <defs>
          <Grad id="fl-distant" top="var(--hero-land-distant)" base="var(--hero-land-haze)" />
          <Grad id="fl-far" top="var(--hero-land-far)" base="var(--hero-land-haze)" />
          <Grad id="fl-mid" top="var(--hero-land-mid)" base="var(--hero-land-far)" />
          <Grad id="fl-near" top="var(--hero-land-near)" base="var(--color-twilight-void)" />
          <Grad id="fl-knoll" top="color-mix(in srgb, var(--hero-land-near) 60%, var(--color-twilight-void))" base="var(--color-twilight-void)" />
          <Grad id="fl-lake" top="color-mix(in srgb, var(--hero-land-haze) 45%, var(--hero-land-far))" base="var(--color-twilight-void)" />
          <Mist id="fl-mist" color="var(--hero-land-haze)" />
          <radialGradient id="fl-dawn">
            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".16" />
            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
          </radialGradient>
          <filter id="fl-soft" x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation="1.3" />
          </filter>
        </defs>

        <g filter="url(#fl-soft)">
          <path d={ridgeFill(SPIRES)} fill="url(#fl-distant)" />
          <path d={risingEdges(SPIRES)} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1.4" strokeLinecap="round" opacity=".22" />
        </g>
        <path d={ridgeFill(FAR)} fill="url(#fl-far)" />
        <path d={risingEdges(FAR)} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1.2" strokeLinecap="round" opacity=".18" />
        <rect y="132" width={W} height="70" fill="url(#fl-mist)" />

        <path d={bankFill(MID_W) + bankFill(MID_E) + MID_TREES} fill="url(#fl-mid)" />

        {/* The lake: still water in front of the mid hills from the water line down, hidden at the sides by the
            near banks, so its only edge is the shore. It holds the first light and a few ripples */}
        <rect y={WATER} width={W} height={H - WATER + 2} fill="url(#fl-lake)" />
        <ellipse cx="1000" cy={WATER + 6} rx="380" ry="12" fill="url(#fl-dawn)" />
        <path
          d={`M660,${WATER + 14}H880M1040,${WATER + 20}H1300M760,${WATER + 30}H960M1110,${WATER + 42}H1250`}
          stroke="var(--hero-land-rim)"
          strokeWidth=".8"
          strokeLinecap="round"
          opacity=".12"
        />

        <path d={bankFill(NEAR_W) + bankFill(NEAR_E) + NEAR_TREES + HOUSES.map((c) => c.body).join("")} fill="url(#fl-near)" />
        {/* The moon on the near roofs, the same rim the ridges take */}
        <path d={HAMLET.map((c) => c.ridge).join("")} fill="none" stroke="var(--hero-land-rim)" strokeWidth="1" strokeLinecap="round" opacity=".3" />
        {/* The lane's string of lights: the wire here, its bulbs with the other lamps */}
        <path d={STRING_WIRE} fill="none" stroke="var(--hero-land-near)" strokeWidth=".9" opacity=".8" />
        <path d={bankFill(KNOLL)} fill="url(#fl-knoll)" />
      </svg>

      <svg {...BAND} className="hero-lamps">
        <defs>
          <radialGradient id="fl-lamp">
            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {LIGHTS.map(([x, y, r], k) => (
          <g key={k} className="fl-lamp" style={cssVars({ "--k": k })}>
            <circle cx={x} cy={y} r={r * 5.5} fill="url(#fl-lamp)" />
            <circle cx={x} cy={y} r={r} fill="var(--hero-lamp)" />
          </g>
        ))}
        {/* The hamlet's windows: squares of warm light, each in its own spill, waking after the far village */}
        {HAMLET.flatMap((c, i) =>
          c.windows.map(([x, y], j) => (
            <g key={`${i}-${j}`} className="fl-lamp" style={cssVars({ "--k": LIGHTS.length + i })}>
              <circle cx={x} cy={y + 1} r="9" fill="url(#fl-lamp)" />
              <rect x={n1(x - 1.8)} y={n1(y - 1.4)} width="3.6" height="4.4" rx=".6" fill="var(--hero-lamp)" />
            </g>
          )),
        )}
      </svg>

      {/* The string's bulbs glimmer on their own clocks. HTML boxes, not SVG children: an animated SVG child
          repaints its whole <svg> every frame, a box's opacity is composited */}
      <div className="fl-bulbs">
        {BULB_AT.map(({ dx, b, k }) => (
          <span key={k} style={cssVars({ "--dx": `${dx}%`, "--b": `${b}%`, "--k": k })} />
        ))}
      </div>

      {/* Each boat drifts in its own box, carrying its lamp and the streak it lays on the water */}
      {BOATS.map(({ x, y, s, cls }) => (
        <div key={cls} className={`fl-boat ${cls}`}>
          <svg {...BAND}>
            <g transform={`translate(${x} ${y}) scale(${s})`}>
              <rect x="-1.5" y="2" width="3" height="18" rx="1.5" fill="url(#fl-streak)" opacity=".7" />
              <path d="M-23,0Q0,7 24,0L18,5Q0,9 -17,5Z" fill="var(--hero-land-near)" />
              <path d="M0,0V-10" stroke="var(--hero-land-near)" strokeWidth="1.4" />
              <circle cy="-10" r="9" fill="url(#fl-lamp)" />
              <circle cy="-10" r="1.6" fill="var(--hero-lamp)" />
            </g>
          </svg>
        </div>
      ))}

      {/* The reflections flicker with the lamps (the wrapper) and shimmer on their own clocks, each in its own
          <svg>: an animated SVG child repaints on the main thread every frame, an <svg> box fades composited */}
      <div className="fl-reflect hero-lamps">
        {REFLECTIONS.map(([x, len], k) => (
          <svg key={x} {...BAND} className="fl-shimmer" style={cssVars({ "--k": k })}>
            {k === 0 && (
              <defs>
                <linearGradient id="fl-streak" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".5" />
                  <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
                </linearGradient>
              </defs>
            )}
            <rect x={x - 1.5} y={WATER + 1} width="3" height={len} rx="1.5" fill="url(#fl-streak)" />
          </svg>
        ))}
      </div>

      {/* Chimney smoke: three soft puffs per chimney, rising and thinning. CSS, so the hills never repaint */}
      <div className="fl-smoke">
        {SMOKE.flatMap(({ dx, b, k }) =>
          [0, 1, 2].map((i) => (
            <span key={`${k}-${i}`} style={cssVars({ "--dx": `${dx}%`, "--b": `${b}%`, "--k": k * 3 + i })} />
          )),
        )}
      </div>
    </div>
  );
}
