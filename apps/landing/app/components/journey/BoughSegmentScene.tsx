import { Fragment } from "react";

import { EmberBud, EmberCore, HEART } from "~/components/hero/HeroBoughScene";
import { generateBough, type Bough, type Limb } from "~/lib/branch";
import { cssVars, n1, type Pt } from "~/lib/geometry";

import { CLOCK, FEATURES, FOLIAGE, LAST_FEATURE, mobileBoughSide, SEGMENTS, W, type FeatureName, type SegmentName } from "./boughSpecs";
import { Foliage } from "./Foliage";

/* The journey bough's drawing: generated and rendered at build time only (BoughSegment wraps it in StaticSvg). */

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
const CROSSINGS = Object.fromEntries(FEATURES.filter((name) => name !== LAST_FEATURE).map((name) => {
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
})) as Record<Exclude<FeatureName, typeof LAST_FEATURE>, Bough>;

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

/** Everything a segment's layers share: its ids, limbs and the gutter (fixed-width) rule. */
function segmentParts({ name, id, h, limbs, mobile, crown }: { name: SegmentName; id: string; h: number; limbs: Limb[]; mobile: boolean; crown: boolean }) {
  const main = limbs[0];
  // A main limb that starts at a joint takes its moon rim from the left and a little below: nudged up, the
  // rim's top edge would bleed through the wood's anti-aliased first row as a light tick across the joint
  const rim = (limb: Limb) => (limb.depth === 1 && SEGMENTS[name].keys[0][1] === 0 ? "translate(-1.2 1.2)" : "translate(-1.2 -1.2)");
  const spine = (i: number) => `#${id}-s${i}`;
  const step = (limb: Limb, i: number, k: number) => (limb.steps[k].d === null ? spine(i) : `#${id}-t${i}-${k}`);
  // The gutter's 5px wood / 2px heart stays the same width at every narrow viewport.
  const gutter = (i: number) => mobile && i === 0;
  const gutterClip = (i: number) => (gutter(i) ? `url(#${id}-gutter)` : undefined);
  return { id, h, limbs, main, mobile, crown, rim, spine, step, gutter, gutterClip };
}

type Seg = ReturnType<typeof segmentParts>;
type Leaf = (typeof FOLIAGE)[SegmentName];

function SegmentDefs({ seg, leaf }: { seg: Seg; leaf: Leaf }) {
  const { id, h, limbs, main, mobile, crown, gutter, spine } = seg;
  return (
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
      <EmberBud id={`${id}-bud`} />
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
  );
}

function HaloStrokes({ seg }: { seg: Seg }) {
  const { id, limbs, mobile, gutter, gutterClip, spine } = seg;
  return (
    <>
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
    </>
  );
}

function Wood({ seg }: { seg: Seg }) {
  const { id, limbs, main, crown, gutter, gutterClip, step, rim } = seg;
  // Twigs first and the main limb last, so every parent's wood covers its children's bases.
  const order = limbs.map((limb, i) => [limb, i] as const).reverse();
  return (
    <>
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
    </>
  );
}

function Heart({ seg }: { seg: Seg }) {
  const { id, limbs, main, mobile, crown, gutter, gutterClip, step } = seg;
  return (
    <>
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
    </>
  );
}

export function SegmentDrawing({ name, crossing = false }: { name: SegmentName; crossing?: boolean }) {
  const { id, viewBox, limbs, buds, flowers } = crossing ? CROSSINGS[name as keyof typeof CROSSINGS] : BUILT[name];
  const h = crossing ? 500 : SEGMENTS[name].h;
  const leaf = FOLIAGE[name];
  const mobile = crossing || name.endsWith("-mobile");
  const crown = name === "finale" || name === "finale-mobile";
  const main = limbs[0];
  const seg = segmentParts({ name, id, h, limbs, mobile, crown });

  return (
    <>
      {/* Top-aligned: if a section's words ever outgrow its aspect, the joint above still holds */}
      <svg className="bough-seg" viewBox={viewBox} preserveAspectRatio={mobile ? "xMinYMin meet" : "xMidYMin meet"} focusable="false">
        <SegmentDefs seg={seg} leaf={leaf} />

        <HaloStrokes seg={seg} />

        <Wood seg={seg} />

        <Heart seg={seg} />

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
          <EmberCore />
        </g>}
      </svg>

    </>
  );
}

export function StrandBody() {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={STRAND} stroke="var(--hero-ember)" strokeWidth="14" opacity=".08" vectorEffect="non-scaling-stroke" />
      <path d={STRAND} stroke="var(--hero-wood-lit)" strokeWidth="5" vectorEffect="non-scaling-stroke" />
      <path d={STRAND} stroke={STRAND_HEART} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </g>
  );
}
