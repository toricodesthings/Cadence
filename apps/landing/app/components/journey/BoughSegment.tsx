import { Fragment } from "react";

import { HEART } from "~/components/hero/HeroBough";
import { generateBough, type Bough, type BoughSpec, type Limb } from "~/lib/branch";

import { Foliage, type FoliageKind } from "./Foliage";
import { cssVars, n1, type Pt } from "~/lib/geometry";

/*
 * The journey's weeping bough (a shidare-ume), one segment per section. Same
 * wood as the hero's boughs, built to grow on scroll instead of on a clock:
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
 * give way to a thin gutter strand, and only the crown is drawn.
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
    h: 760,
    w0: 8,
    wEnd: 7,
    keys: [[500, 0], [500, 70], [484, 240], [514, 440], [492, 620], [500, 700], [500, 760]],
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
} satisfies Record<string, SegmentSpec>;

export type SegmentName = keyof typeof SEGMENTS;

/** What each segment's tips carry. The seasons are read from the foliage first, and the colour only follows. */
const FOLIAGE: Record<SegmentName, FoliageKind> = {
  prelude: "ume",
  spring: "ume",
  summer: "wisteria",
  autumn: "maple",
  emilie: "ume",
  winter: "frost",
  constellation: "ume",
  finale: "ume",
};

export const segmentHeight = (name: SegmentName): number => SEGMENTS[name].h;

const BUILT = Object.fromEntries(
  Object.entries(SEGMENTS).map(([name, { h, ...spec }]) => [
    name,
    generateBough({
      joint: "both",
      ...spec,
      viewBox: [W, h],
      start: 0,
      dur: CLOCK,
      focus: [W / 2, h / 2],
      bloom: "tip",
    }),
  ]),
) as Record<SegmentName, Bough>;

const n3 = (v: number) => Math.round(v * 1000) / 1000;
/** A stretch of the segment's clock, as fractions the CSS turns into a scroll range. */
const span = (from: number, to: number) => cssVars({ "--t0": n3(from / CLOCK), "--t1": n3(to / CLOCK) });
const timing = (limb: Limb) => span(limb.start, limb.start + limb.dur);
/** Joined main limbs meet their neighbours with flat ends, so nothing doubles up at a joint. */
const cap = (limb: Limb) => (limb.depth === 1 ? "butt" : "round");
/** The main limb's halo is one width down the whole page, so it never steps at a joint. */
const MAIN_HALO = 11;

/** The gutter strand for narrow screens: near-vertical, drawn in strokes that keep their width however tall it stretches. */
const STRAND = "M12,0C8,180 16,360 12,500S8,820 12,1000";

export function BoughSegment({ name }: { name: SegmentName }) {
  const { id, viewBox, limbs, buds, flowers } = BUILT[name];
  const h = SEGMENTS[name].h;
  const leaf = FOLIAGE[name];
  // A main limb that starts at a joint takes its moon rim from the left and a little below: nudged up, the
  // rim's top edge would bleed through the wood's anti-aliased first row as a light tick across the joint
  const rim = (limb: Limb) => (limb.depth === 1 && SEGMENTS[name].keys[0][1] === 0 ? "translate(-1.2 1.2)" : "translate(-1.2 -1.2)");
  const spine = (i: number) => `#${id}-s${i}`;
  const step = (limb: Limb, i: number, k: number) => (limb.steps[k].d === null ? spine(i) : `#${id}-t${i}-${k}`);
  const main = limbs[0];
  // Twigs first and the main limb last, so every parent's wood covers its children's bases.
  const order = limbs.map((limb, i) => [limb, i] as const).reverse();

  return (
    <div className="bough" aria-hidden="true">
      {/* Top-aligned: if a section's words ever outgrow its aspect, the joint above still holds */}
      <svg className="bough-seg" viewBox={viewBox} preserveAspectRatio="xMidYMin meet" focusable="false">
        <defs>
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
          <g id={`${id}-bud`}>
            <circle r="5" fill="var(--hero-ember)" opacity=".22" />
            <circle r="2.2" fill="var(--hero-ember)" />
            <circle r="1" fill="color-mix(in srgb, var(--hero-ember) 35%, white)" />
          </g>
          <Foliage id={`${id}-ume`} kind={leaf} />
          {limbs.map((limb, i) => (
            <Fragment key={i}>
              <path id={`${id}-s${i}`} d={limb.spine} pathLength={1} />
              {limb.steps.map((s, k) => s.d && <path key={k} id={`${id}-t${i}-${k}`} d={s.d} pathLength={s.len} />)}
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
          {[
            [2.6, 0.05],
            [1.5, 0.09],
          ].map(([k, o]) => (
            <g key={k} opacity={o}>
              {limbs.map((limb, i) => (
                <use
                  key={i}
                  href={spine(i)}
                  className="seg-grow"
                  strokeWidth={n1((limb.depth === 1 ? MAIN_HALO : limb.w0) * k + 4)}
                  strokeLinecap={cap(limb)}
                  style={timing(limb)}
                />
              ))}
            </g>
          ))}
        </g>

        {order.map(([limb, i]) =>
          limb.outline ? (
            <g key={i} mask={`url(#${id}-m${i})`}>
              {/* Moon rim: the outline nudged toward the key light, showing past the wood's upper-left edge */}
              <use href={`#${id}-o${i}`} fill="var(--hero-wood-rim)" transform={rim(limb)} />
              <use href={`#${id}-o${i}`} fill={`url(#${id}-grain)`} />
            </g>
          ) : (
            <g key={i} className="seg-grows" style={timing(limb)} fill="none" stroke={`url(#${id}-grain)`} strokeLinecap="round">
              {limb.steps.map((s, k) => (
                <use key={k} href={step(limb, i, k)} strokeWidth={s.w} />
              ))}
            </g>
          ),
        )}

        {/* Heart: the amber light inside the wood. Opaque (pre-mixed into the wood) with round ends, so where two
            segments' hearts overlap at a joint there is no brighter spot and no anti-aliased seam */}
        <g fill="none" stroke="color-mix(in srgb, var(--hero-wood-heart) 75%, var(--hero-wood))" strokeLinecap="round">
          {limbs.map((limb, i) => (
            <g key={i} className="seg-grows" style={timing(limb)}>
              {limb.steps.map((s, k) => (
                <use key={k} href={step(limb, i, k)} strokeWidth={n1(s.w * HEART[limb.depth])} />
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
        <g className="seg-ember" fill="var(--hero-ember)" style={{ ...timing(main), offsetPath: `path("${main.spine}")` }}>
          <circle r="7" opacity=".3" />
          <circle r="3" />
          <circle r="1.4" fill="color-mix(in srgb, var(--hero-ember) 35%, white)" />
        </g>
      </svg>

      <svg className="bough-strand" viewBox="0 0 24 1000" preserveAspectRatio="none" focusable="false">
        <g fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke">
          <path d={STRAND} stroke="var(--hero-ember)" strokeWidth="14" opacity=".08" vectorEffect="non-scaling-stroke" />
          <path d={STRAND} stroke="var(--hero-wood-lit)" strokeWidth="5" vectorEffect="non-scaling-stroke" />
          <path d={STRAND} stroke="var(--hero-wood-heart)" strokeWidth="2" opacity=".75" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
    </div>
  );
}
