import { Fragment } from "react";

import { HEART } from "~/components/hero/HeroBough";
import { generateBough, type Bough, type BoughSpec, type Limb } from "~/lib/branch";

import { Foliage, type FoliageKind } from "./Foliage";
import { cssVars, n1, type Pt } from "~/lib/geometry";

/*
 * The journey's weeping bough (a shidare-ume), one segment per section. A quieter
 * copper tint than the hero's boughs, built to grow on scroll instead of on a clock:
 * - every segment's main limb starts at (500, 0) and ends at (500, h) heading
 *   straight down, and its section has the same aspect as its viewBox, so the
 *   segments meet head to tail with no gap or kink whatever the width;
 * - the main limb is one slice of a single long taper (w0 → wEnd), so the page
 *   reads as one branch from one tree;
 * - its growth runs on the section's view timeline (journey.css), and nothing
 *   that grows is blurred (the halo is two faint strokes), so a scroll frame
 *   repaints strokes, never a filter;
 * - it always passes behind the panels and the words, never over them.
 * The last segment is the crown. On narrow and portrait screens the segments
 * give way to alternating gutter strands with curved crossings between features;
 * the crown continues from the final left gutter to the right.
 */

const W = 1000;
/** Every segment is timed on this clock; journey.css maps it onto the section's scroll. */
const CLOCK = 2000;
/** A chapter is one screen: words beside a panel, the bough between. */
const CHAPTER_H = 640;

/** Chapter keys are drawn on a 900-unit box and fitted to the chapter's height; 0 and 900 land exactly on the joints. */
const fit = (keys: readonly Pt[]): Pt[] => keys.map(([x, y]) => [x, Math.round((y * CHAPTER_H) / 900)] as const);

type SegmentSpec = Pick<
  BoughSpec,
  "id" | "seed" | "keys" | "w0" | "wEnd" | "forks" | "joint" | "bloomShare" | "clusterSize"
> & {
  /** viewBox height; the section's aspect is 1000 / h. */
  h: number;
};

/**
 * A chapter's forks, by the side its words take (1 turns off the falling limb to the left, -1 to the right).
 * The words hold x 0–444 (or 556–1000) over y ≈ 170–500, so the long gestures reach the panel's side, where
 * they show above its top and pass behind it; on the words' side only a short twig above them and a strand
 * weeping below them, and nothing crosses a line of text.
 */
const chapterForks = (words: 1 | -1, lean = 0): BoughSpec["forks"] => {
  const panel = -words as 1 | -1;
  return [
    {
      t: 0.15, side: panel, angle: 74 + lean, len: 0.3,
      forks: [{ t: 0.45, side: words, len: 0.4 }, { t: 0.75, side: panel, len: 0.35 }],
    },
    { t: 0.11, side: words, angle: 66, len: 0.1, forks: [] },
    { t: 0.3, side: panel, angle: 56 - lean, len: 0.34, weep: true, forks: [{ t: 0.55, side: words, len: 0.3 }] },
    { t: 0.52, side: panel, angle: 38, len: 0.13, forks: [] },
    { t: 0.84, side: words, angle: 40, len: 0.15, weep: true, forks: [] },
    { t: 0.9, side: panel, angle: 36, len: 0.12, forks: [] },
  ];
};

const SEGMENTS = {
  // Enters from the right screen edge under the statement and arcs down into the centre gutter.
  prelude: {
    id: "js-prelude",
    seed: 601,
    h: 720,
    w0: 16,
    wEnd: 14.5,
    // One long diagonal from the top right (where the hero's right bough hangs) into the joint: it falls about
    // as fast as it travels, so the growth keeps pace with the scroll instead of shooting across a near-level
    // stretch. It keeps right of the statement (x ≤ 865, y 50–290 at narrow desktops) until it is below it.
    keys: [[1600, 30], [1380, 110], [1160, 200], [980, 290], [860, 380], [720, 470], [600, 560], [530, 640], [500, 680], [500, 720]],
    forks: [
      { t: 0.28, side: -1, len: 0.12, weep: true },
      { t: 0.42, side: -1, len: 0.1 },
      { t: 0.56, side: 1, len: 0.09, weep: true },
      { t: 0.7, side: -1, len: 0.09, weep: true, forks: [] },
      { t: 0.8, side: 1, len: 0.1, weep: true, forks: [] },
    ],
    bloomShare: 0.5,
  },
  // Enters from the right after the mobile statement, then settles into the left gutter joint.
  "prelude-mobile": {
    id: "js-prelude-mobile",
    seed: 607,
    h: 500,
    w0: 14,
    wEnd: 14,
    keys: [[1120, 30], [980, 50], [812, 94], [626, 134], [420, 184], [232, 254], [100, 320], [24, 390], [0, 450], [0, 500]],
    forks: [
      { t: 0.24, side: -1, angle: 42, len: 0.13, weep: true },
      { t: 0.43, side: 1, angle: 38, len: 0.1 },
      { t: 0.64, side: -1, angle: 36, len: 0.13, weep: true },
    ],
    bloomShare: 0.5,
  },
  // Panel right: a twig reaches left over the words, a strand weeps behind the panel's corner.
  spring: {
    id: "js-spring",
    seed: 613,
    h: CHAPTER_H,
    w0: 14.5,
    wEnd: 12.5,
    keys: fit([[500, 0], [500, 70], [476, 210], [522, 390], [486, 570], [512, 730], [500, 830], [500, 900]]),
    forks: chapterForks(1),
    bloomShare: 0.5,
  },
  // Panel left: the same gesture mirrored (never flipped: its own keys and seed).
  summer: {
    id: "js-summer",
    seed: 727,
    h: CHAPTER_H,
    w0: 12.5,
    wEnd: 11,
    keys: fit([[500, 0], [500, 70], [524, 220], [480, 400], [516, 580], [490, 740], [500, 830], [500, 900]]),
    forks: chapterForks(-1, 4),
    bloomShare: 0.5,
  },
  autumn: {
    id: "js-autumn",
    seed: 839,
    h: CHAPTER_H,
    w0: 11,
    wEnd: 10,
    keys: fit([[500, 0], [500, 70], [480, 230], [518, 410], [484, 590], [510, 740], [500, 830], [500, 900]]),
    forks: chapterForks(1, -4),
    bloomShare: 0.5,
  },
  // Emilie, the one tall chapter: the limb swings wide of her centred words, then falls behind her stage.
  emilie: {
    id: "js-emilie",
    seed: 911,
    h: 900,
    w0: 10,
    wEnd: 9,
    // Her words hold x 205–850, y 130–400 (wider at narrow desktops, where the glints wrap); the stage's
    // panel starts below them at x 418. The limb parts above the eyebrow: it swings right round the words,
    // its twin (held on authored points) swings left, and they meet again behind the panel.
    keys: [
      [500, 0], [500, 40], [560, 76], [700, 104], [838, 146], [915, 236], [930, 336], [890, 428],
      [780, 482], [640, 522], [540, 600], [506, 720], [500, 850], [500, 900],
    ],
    forks: [
      {
        t: 0.05, side: -1, until: 0.78, wShare: 0.8,
        path: [[430, 84], [300, 110], [162, 164], [86, 258], [76, 350], [116, 432], [222, 482], [362, 508]],
        forks: [
          { t: 0.3, side: 1, angle: 52, len: 0.08, weep: true, forks: [] },
          { t: 0.5, side: 1, angle: 46, len: 0.09, weep: true },
          { t: 0.7, side: 1, angle: 40, len: 0.06, forks: [] },
        ],
      },
      { t: 0.2, side: -1, angle: 50, len: 0.07, forks: [] },
      { t: 0.33, side: -1, angle: 55, len: 0.09, weep: true },
      { t: 0.47, side: -1, angle: 45, len: 0.07, forks: [] },
    ],
    bloomShare: 0.4,
  },
  // Winter is bare: lit buds only, no blossom.
  winter: {
    id: "js-winter",
    seed: 953,
    h: CHAPTER_H,
    w0: 9,
    wEnd: 8,
    keys: fit([[500, 0], [500, 70], [522, 220], [482, 400], [514, 580], [490, 740], [500, 830], [500, 900]]),
    forks: chapterForks(-1, -2),
    // Bare wood, and what it carries is ice, not blossom (the kind below)
    bloomShare: 0.35,
  },
  constellation: {
    id: "js-constellation",
    seed: 977,
    h: 630,
    w0: 8,
    wEnd: 7,
    keys: [[500, 0], [500, 58], [484, 199], [514, 365], [492, 514], [500, 580], [500, 630]],
    forks: [
      { t: 0.3, side: -1, angle: 50, len: 0.16, weep: true, forks: [] },
      { t: 0.62, side: 1, angle: 46, len: 0.14, weep: true, forks: [] },
    ],
    bloomShare: 0,
  },
  // The crown: the limb opens into four long arcing limbs wider than the column, every tip in bloom.
  finale: {
    id: "js-finale",
    seed: 991,
    h: 560,
    w0: 7,
    joint: "start",
    keys: [[500, 0], [500, 60], [486, 150], [508, 240], [500, 330]],
    forks: [
      {
        t: 0.26, side: 1, angle: 94, len: 1.45,
        forks: [
          { t: 0.2, side: 1, len: 0.24, weep: true },
          { t: 0.34, side: -1, len: 0.3 },
          { t: 0.5, side: 1, len: 0.34, weep: true },
          { t: 0.66, side: -1, len: 0.26 },
          { t: 0.8, side: 1, len: 0.28, weep: true },
        ],
      },
      {
        t: 0.36, side: -1, angle: 92, len: 1.55,
        forks: [
          { t: 0.18, side: -1, len: 0.24, weep: true },
          { t: 0.32, side: 1, len: 0.3 },
          { t: 0.48, side: -1, len: 0.34, weep: true },
          { t: 0.64, side: 1, len: 0.26 },
          { t: 0.78, side: -1, len: 0.28, weep: true },
        ],
      },
      {
        t: 0.55, side: 1, angle: 64, len: 0.95, weep: true,
        forks: [{ t: 0.35, side: -1, len: 0.35 }, { t: 0.6, side: 1, len: 0.3, weep: true }, { t: 0.82, side: -1, len: 0.25 }],
      },
      {
        t: 0.66, side: -1, angle: 62, len: 1, weep: true,
        forks: [{ t: 0.33, side: 1, len: 0.35 }, { t: 0.58, side: -1, len: 0.3, weep: true }, { t: 0.8, side: 1, len: 0.25 }],
      },
      { t: 0.82, side: 1, angle: 40, len: 0.35, weep: true },
    ],
    bloomShare: 1,
    clusterSize: [4, 7],
  },
  // A winding continuation, with uneven long limbs and seeded twigs reaching above and below it.
  "finale-mobile": {
    id: "js-finale-mobile",
    seed: 997,
    h: 560,
    w0: 14,
    joint: "start",
    keys: [[0, 0], [0, 60], [28, 128], [120, 182], [232, 204], [310, 268], [446, 284], [564, 356], [726, 374], [934, 490]],
    forks: [
      {
        t: 0.17, side: -1, angle: 40, len: 0.5,
        forks: [
          { t: 0.24, side: 1, len: 0.27, weep: true },
          { t: 0.53, side: -1, len: 0.24 },
          { t: 0.78, side: 1, len: 0.36, weep: true },
        ],
      },
      { t: 0.28, side: 1, angle: 64, len: 0.25, weep: true },
      {
        t: 0.42, side: -1, angle: 48, len: 0.48,
        forks: [{ t: 0.35, side: -1, len: 0.24 }, { t: 0.68, side: 1, len: 0.32, weep: true }],
      },
      { t: 0.59, side: 1, angle: 55, len: 0.18, weep: true },
      { t: 0.76, side: -1, angle: 48, len: 0.24 },
    ],
    bloomShare: 1,
    clusterSize: [4, 7],
  },
} satisfies Record<string, SegmentSpec>;

export type SegmentName = keyof typeof SEGMENTS;

const FEATURES = ["spring", "summer", "autumn", "emilie", "winter", "constellation"] as const;
type FeatureName = typeof FEATURES[number];
export const mobileBoughSide = (name: SegmentName) => FEATURES.indexOf(name as FeatureName) % 2 === 1 ? "right" : "left";

/** What each segment's tips carry. The seasons are read from the foliage first, and the colour only follows. */
const FOLIAGE: Record<SegmentName, FoliageKind> = {
  prelude: "ume",
  "prelude-mobile": "ume",
  spring: "ume",
  summer: "wisteria",
  autumn: "maple",
  emilie: "ume",
  winter: "frost",
  constellation: "ume",
  finale: "ume",
  "finale-mobile": "ume",
};

export const segmentHeight = (name: SegmentName): number => SEGMENTS[name].h;

const BUILT = Object.fromEntries(
  Object.entries(SEGMENTS).map(([name, { h, ...spec }]) => [
    name,
    generateBough({
      joint: "both",
      ...spec,
      strokeTrunk: name.endsWith("-mobile"),
      viewBox: [W, h],
      start: 0,
      dur: CLOCK,
      focus: [W / 2, h / 2],
      bloom: "tip",
    }),
  ]),
) as Record<SegmentName, Bough>;

/** A separate, aspect-matched crossing below each feature keeps curved wood clear of its content. */
const CROSSING_KEYS: readonly Pt[] = [[0, 0], [0, 60], [54, 148], [224, 220], [456, 266], [704, 316], [934, 388], [1000, 440], [1000, 500]];
const CROSSINGS = Object.fromEntries(FEATURES.map((name) => {
  const right = mobileBoughSide(name) === "right";
  return [name, generateBough({
    id: `js-${name}-crossing`,
    seed: SEGMENTS[name].seed,
    viewBox: [W, 500],
    keys: CROSSING_KEYS.map(([x, y]) => [right ? W - x : x, y] as Pt),
    w0: 14,
    wEnd: 14,
    joint: "both",
    strokeTrunk: true,
    start: 0,
    dur: CLOCK,
    focus: [W / 2, 250],
    forks: [
      { t: 0.24, side: right ? 1 : -1, angle: 42, len: 0.12, weep: true },
      { t: 0.5, side: right ? -1 : 1, angle: 38, len: 0.09 },
      { t: 0.72, side: right ? 1 : -1, angle: 36, len: 0.12, weep: true },
    ],
    bloom: "tip",
    bloomShare: SEGMENTS[name].bloomShare,
  })];
})) as Record<FeatureName, Bough>;

const n3 = (v: number) => Math.round(v * 1000) / 1000;
/** A stretch of the segment's clock, as fractions the CSS turns into a scroll range. */
const span = (from: number, to: number) => cssVars({ "--t0": n3(from / CLOCK), "--t1": n3(to / CLOCK) });
const timing = (limb: Limb) => span(limb.start, limb.start + limb.dur);
/** Joined main limbs meet their neighbours with flat ends, so nothing doubles up at a joint. */
const cap = (limb: Limb) => (limb.depth === 1 ? "butt" : "round");
/** The main limb's halo is one width down the whole page, so it never steps at a joint. */
const MAIN_HALO = 11;
const WOOD_HEART = "color-mix(in srgb, var(--hero-wood-heart) 75%, var(--hero-wood))";
const STRAND_HEART = "color-mix(in srgb, var(--hero-wood-heart) 75%, var(--hero-wood-lit))";

/** Match the preceding trunk at the crown's neck, reaching copper before its first fork. */
const CROWN_JOIN = [
  ["grain", "color-mix(in srgb, var(--hero-branch-lit) 50%, var(--hero-branch-wood))", "color-mix(in srgb, var(--hero-wood-lit) 50%, var(--hero-wood))"],
  ["rim", "var(--hero-branch-rim)", "var(--hero-wood-rim)"],
  ["heart", "color-mix(in srgb, var(--hero-branch-heart) 75%, var(--hero-branch-wood))", WOOD_HEART],
] as const;

/** Vertical tangents and a slight overlap keep joins closed at fractional viewport sizes. */
const STRAND = "M12,0C12,180 16,360 12,500S12,820 12,1000";

export function BoughSegment({ name }: { name: SegmentName }) {
  return name === "finale" || name === "prelude" ? (
    <>
      <SegmentDrawing name={name} />
      <SegmentDrawing name={`${name}-mobile`} />
    </>
  ) : name.endsWith("-mobile") ? <SegmentDrawing name={name} /> : (
    <>
      <SegmentDrawing name={name} />
      <div className="bough bough-mobile" data-side={mobileBoughSide(name)} aria-hidden="true">
        <svg className="bough-strand" viewBox="0 0 24 1000" preserveAspectRatio="none" focusable="false">
          <g fill="none" strokeLinecap="round">
            <path d={STRAND} stroke="var(--hero-ember)" strokeWidth="14" opacity=".08" vectorEffect="non-scaling-stroke" />
            <path d={STRAND} stroke="var(--hero-wood-lit)" strokeWidth="5" vectorEffect="non-scaling-stroke" />
            <path d={STRAND} stroke={STRAND_HEART} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
        <div className="bough-crossing">
          <SegmentDrawing name={name} crossing />
        </div>
      </div>
    </>
  );
}

function SegmentDrawing({ name, crossing = false }: { name: SegmentName; crossing?: boolean }) {
  const { id, viewBox, limbs, buds, flowers } = crossing ? CROSSINGS[name as FeatureName] : BUILT[name];
  const h = crossing ? 500 : SEGMENTS[name].h;
  const leaf = FOLIAGE[name];
  const mobile = crossing || name.endsWith("-mobile");
  const crown = name === "finale" || name === "finale-mobile";
  const entrance = name === "prelude" || name === "prelude-mobile";
  // A main limb that starts at a joint takes its moon rim from the left and a little below: nudged up, the
  // rim's top edge would bleed through the wood's anti-aliased first row as a light tick across the joint
  const rim = (limb: Limb) => (limb.depth === 1 && SEGMENTS[name].keys[0][1] === 0 ? "translate(-1.2 1.2)" : "translate(-1.2 -1.2)");
  const spine = (i: number) => `#${id}-s${i}`;
  const step = (limb: Limb, i: number, k: number) => (limb.steps[k].d === null ? spine(i) : `#${id}-t${i}-${k}`);
  const main = limbs[0];
  // The gutter's 5px wood / 2px heart stays the same width at every narrow viewport.
  const gutter = (i: number) => mobile && i === 0;
  const gutterClip = (i: number) => gutter(i) ? `url(#${id}-gutter)` : undefined;
  // Twigs first and the main limb last, so every parent's wood covers its children's bases.
  const order = limbs.map((limb, i) => [limb, i] as const).reverse();

  return (
    <div className={`bough${crossing ? "" : crown ? mobile ? " bough-crown-mobile" : " bough-crown-wide" : entrance ? mobile ? " bough-prelude-mobile" : " bough-prelude-wide" : " bough-feature-wide"}`} aria-hidden="true">
      {/* Top-aligned: if a section's words ever outgrow its aspect, the joint above still holds */}
      <svg className="bough-seg" viewBox={viewBox} preserveAspectRatio={mobile ? "xMinYMin meet" : "xMidYMin meet"} focusable="false">
        <defs>
          {/* A vertical clip grows fixed-width strokes without SVG's scale-dependent dash/pathLength rounding. */}
          {mobile && (
            <clipPath id={`${id}-gutter`} clipPathUnits="userSpaceOnUse">
              <rect className="seg-gutter" x={-W} width={W * 3} height={h} style={timing(main)} />
            </clipPath>
          )}
          {/* The halo takes the season over from the section above across its first stretch, so a joint never changes colour at a line */}
          <linearGradient id={`${id}-halo`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={n1(h * 0.3)}>
            <stop offset="0" stopColor="var(--ember-prev)" />
            <stop offset="1" stopColor="var(--hero-ember)" />
          </linearGradient>
          {/* Lit toward the moon (left), shaded away from it; horizontal only, so segments share it across joints */}
          <linearGradient id={`${id}-grain`} gradientUnits="userSpaceOnUse" x1="400" y1="0" x2="600" y2="0">
            <stop offset="0" stopColor="var(--hero-wood-lit)" />
            <stop offset="1" stopColor="var(--hero-wood)" />
          </linearGradient>
          {crown && CROWN_JOIN.map(([part, from, to]) => (
            <linearGradient key={part} id={`${id}-join-${part}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={mobile ? 180 : 60}>
              <stop offset="0" stopColor={mobile && part === "grain" ? "var(--hero-wood-lit)" : mobile && part === "heart" ? STRAND_HEART : from} stopOpacity={mobile && part === "rim" ? 0 : 1} />
              <stop offset="1" stopColor={to} />
            </linearGradient>
          ))}
          <g id={`${id}-bud`}>
            <circle r="5" fill="var(--hero-ember)" opacity=".22" />
            <circle r="2.2" fill="var(--hero-ember)" />
            <circle r="1" fill="color-mix(in srgb, var(--hero-ember) 35%, white)" />
          </g>
          <Foliage id={`${id}-ume`} kind={leaf} />
          {limbs.map((limb, i) => (
            <Fragment key={i}>
              {/* vector-effect belongs on the referenced path: it does not inherit through <use>. */}
              <path id={`${id}-s${i}`} d={limb.spine} pathLength={1} vectorEffect={gutter(i) ? "non-scaling-stroke" : undefined} />
              {limb.steps.map((s, k) => s.d && <path key={k} id={`${id}-t${i}-${k}`} d={s.d} pathLength={s.len} vectorEffect={gutter(i) ? "non-scaling-stroke" : undefined} />)}
              {limb.outline && (
                <>
                  <path id={`${id}-o${i}`} d={limb.outline} />
                  <mask id={`${id}-m${i}`}>
                    <use
                      href={spine(i)}
                      className="seg-grow"
                      fill="none"
                      stroke="#fff"
                      strokeWidth={n1(limb.w0 * 1.3)}
                      strokeLinecap="round"
                      style={timing(limb)}
                    />
                  </mask>
                </>
              )}
            </Fragment>
          ))}
        </defs>

        {/* Halo: two faint, wide strokes of ember along every spine */}
        <g fill="none" stroke={`url(#${id}-halo)`}>
          {(mobile ? [[2.6, 0.08]] : [
            [2.6, 0.05],
            [1.5, 0.09],
          ]).map(([k, o]) => (
            <g key={k} opacity={o}>
              {limbs.map((limb, i) => (
                <use
                  key={i}
                  href={spine(i)}
                  className={gutter(i) ? undefined : "seg-grow"}
                  clipPath={gutterClip(i)}
                  stroke={gutter(i) ? "var(--hero-ember)" : undefined}
                  strokeWidth={gutter(i) ? 14 : n1((limb.depth === 1 ? MAIN_HALO : limb.w0) * k + 4)}
                  vectorEffect={gutter(i) ? "non-scaling-stroke" : undefined}
                  strokeLinecap={cap(limb)}
                  style={timing(limb)}
                />
              ))}
            </g>
          ))}
        </g>

        {order.map(([limb, i]) =>
          limb.outline && !gutter(i) ? (
            <g key={i} mask={`url(#${id}-m${i})`}>
              {/* Moon rim: the outline nudged toward the key light, showing past the wood's upper-left edge */}
              <use href={`#${id}-o${i}`} fill={crown ? `url(#${id}-join-rim)` : "var(--hero-wood-rim)"} transform={rim(limb)} />
              <use href={`#${id}-o${i}`} fill={`url(#${id}-${crown && i === 0 ? "join-grain" : "grain"})`} />
            </g>
          ) : (
            <g key={i} className={gutter(i) ? undefined : "seg-grows"} clipPath={gutterClip(i)} style={timing(limb)} fill="none" stroke={gutter(i) && !crown ? "var(--hero-wood-lit)" : `url(#${id}-${gutter(i) ? "join-grain" : "grain"})`} strokeLinecap="round">
              {gutter(i) && crown && limb.steps.map((s, k) => (
                <use key={`rim-${k}`} href={step(limb, i, k)} stroke={`url(#${id}-join-rim)`} strokeWidth={n1(s.w * 6 / main.w0)} vectorEffect="non-scaling-stroke" />
              ))}
              {limb.steps.map((s, k) => (
                <use key={k} href={step(limb, i, k)} strokeWidth={gutter(i) ? n1(s.w * 5 / main.w0) : s.w} vectorEffect={gutter(i) ? "non-scaling-stroke" : undefined} />
              ))}
            </g>
          ),
        )}

        {/* Heart: the amber light inside the wood. Opaque (pre-mixed into the wood) with round ends, so where two
            segments' hearts overlap at a joint there is no brighter spot and no anti-aliased seam */}
        <g fill="none" stroke={crown ? `url(#${id}-join-heart)` : mobile ? STRAND_HEART : WOOD_HEART} strokeLinecap="round">
          {limbs.map((limb, i) => (
            <g key={i} className={gutter(i) ? undefined : "seg-grows"} clipPath={gutterClip(i)} style={timing(limb)}>
              {limb.steps.map((s, k) => (
                <use key={k} href={step(limb, i, k)} strokeWidth={n1(gutter(i) ? s.w * 2 / main.w0 : s.w * HEART[limb.depth])} vectorEffect={gutter(i) ? "non-scaling-stroke" : undefined} />
              ))}
            </g>
          ))}
        </g>

        {buds.map((bud) => (
          <g key={`${bud.x},${bud.y}`} className="seg-bud" style={span(bud.at, bud.at + 260)}>
            <use href={`#${id}-bud`} x={bud.x} y={bud.y} />
          </g>
        ))}

        {flowers.map((f, k) => (
          <g key={`${f.x},${f.y}`} transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}>
            <g className="seg-flower" style={span(f.at, f.at + 300)}>
              <use
                href={`#${id}-ume${leaf === "maple" && k % 3 === 1 ? "-b" : ""}`}
                x={n1(-f.size * 0.8)}
                y={n1(-f.size * 0.8)}
                width={n1(f.size * 1.6)}
                height={n1(f.size * 1.6)}
              />
            </g>
          </g>
        ))}

        {/* The lantern leading the reader: an ember riding the growth front (omitted without motion-path support) */}
        {!mobile && <g className="seg-ember" fill="var(--hero-ember)" style={{ ...timing(main), offsetPath: `path("${main.spine}")` }}>
          <circle r="7" opacity=".3" />
          <circle r="3" />
          <circle r="1.4" fill="color-mix(in srgb, var(--hero-ember) 35%, white)" />
        </g>}
      </svg>

    </div>
  );
}
