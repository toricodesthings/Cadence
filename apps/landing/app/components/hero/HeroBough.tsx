import { Fragment } from "react";

import { generateBough, type Bough, type BoughSpec, type Limb } from "~/lib/branch";
import { cssVars, n1 } from "~/lib/geometry";

/*
 * One glowing bough per wrapper, anchored to a viewport edge by hero.css.
 * Five stacked <svg>s share the box, back to front:
 * 1. halo: a wide ember stroke along every spine, blurred (CSS filter);
 * 2. wood: thick limbs as smooth tapered outlines (moon rim, grain), each
 *    revealed by a mask stroked along its own spine; fine twigs as stacked,
 *    narrowing strokes revealed by their own dashes (no mask);
 * 3. heart: the same narrowing strokes in bright amber, lightly blurred, so
 *    every limb glows from inside and the light melts into the bark;
 * 4. buds; 5. blossoms and the leading ember.
 * Filters are painted into the bough's layer, not composited, so the wind
 * moves a finished texture and only the intro repaints.
 */

const LAND: readonly [number, number] = [900, 700];
const PORT: readonly [number, number] = [600, 640];

const SPECS = {
  // Rises from the left edge and reaches toward the wordmark's left rule.
  l: {
    id: "hb-l",
    seed: 101,
    viewBox: LAND,
    keys: [[-24, 500], [120, 470], [250, 426], [370, 382], [470, 346], [560, 320], [640, 304]],
    w0: 46,
    start: 260,
    dur: 1300,
    focus: [640, 280],
    forks: [
      { t: 0.2, side: -1, len: 0.4, forks: [{ t: 0.35, side: 1 }, { t: 0.62, side: -1, len: 0.5 }, { t: 0.85, side: 1 }] },
      { t: 0.34, side: 1, len: 0.2 },
      { t: 0.48, side: -1, len: 0.3, forks: [{ t: 0.45, side: 1, back: true, len: 0.4 }, { t: 0.72, side: -1 }] },
      { t: 0.62, side: 1, len: 0.2 },
      { t: 0.75, side: -1, len: 0.22 },
      { t: 0.9, side: 1, len: 0.14 },
    ],
  },
  // Hangs from the right edge just under the header and reaches toward the wordmark's right rule.
  r: {
    id: "hb-r",
    seed: 211,
    viewBox: LAND,
    keys: [[924, 62], [800, 80], [690, 110], [590, 148], [500, 188], [420, 220], [352, 242]],
    w0: 38,
    start: 340,
    dur: 1300,
    focus: [360, 300],
    forks: [
      { t: 0.18, side: -1, len: 0.34, forks: [{ t: 0.45, side: 1 }, { t: 0.75, side: -1 }] },
      { t: 0.34, side: 1, len: 0.14, forks: [] },
      { t: 0.48, side: -1, len: 0.3, forks: [{ t: 0.5, side: 1, back: true, len: 0.4 }, { t: 0.78, side: -1 }] },
      { t: 0.62, side: 1, len: 0.16, forks: [] },
      { t: 0.76, side: -1, len: 0.22 },
      { t: 0.9, side: 1, len: 0.12, forks: [] },
    ],
  },
  s: {
    id: "hb-s",
    seed: 307,
    viewBox: LAND,
    keys: [[924, 716], [810, 688], [716, 646], [640, 598], [584, 552], [540, 508], [512, 470]],
    w0: 24,
    start: 520,
    dur: 900,
    focus: [400, 400],
    forks: [
      { t: 0.4, side: 1, len: 0.42, forks: [{ t: 0.6, side: -1 }] },
      { t: 0.62, side: -1, len: 0.38 },
      { t: 0.84, side: 1, len: 0.28 },
    ],
  },
  pl: {
    id: "hb-pl",
    seed: 401,
    viewBox: PORT,
    keys: [[-20, 110], [90, 118], [180, 136], [262, 160], [332, 190], [384, 224]],
    w0: 32,
    start: 260,
    dur: 1300,
    focus: [330, 330],
    forks: [
      { t: 0.3, side: -1, len: 0.42, forks: [{ t: 0.6, side: 1 }] },
      { t: 0.5, side: 1, len: 0.28, forks: [{ t: 0.5, side: -1, back: true }] },
      { t: 0.7, side: -1, len: 0.34 },
      { t: 0.86, side: 1, len: 0.22, forks: [] },
    ],
  },
  pr: {
    id: "hb-pr",
    seed: 503,
    viewBox: PORT,
    keys: [[620, 600], [520, 590], [430, 572], [350, 560], [280, 556], [226, 560]],
    w0: 32,
    start: 340,
    dur: 1300,
    focus: [270, 380],
    forks: [
      { t: 0.3, side: 1, len: 0.36, forks: [{ t: 0.6, side: -1 }] },
      { t: 0.52, side: -1, len: 0.3 },
      { t: 0.7, side: 1, len: 0.3, forks: [{ t: 0.55, side: -1, back: true }] },
      { t: 0.86, side: -1, len: 0.24, forks: [] },
    ],
  },
} satisfies Record<string, BoughSpec>;

export type BoughName = keyof typeof SPECS;

const BOUGHS = Object.fromEntries(
  Object.entries(SPECS).map(([name, spec]) => [name, generateBough(spec)]),
) as Record<BoughName, Bough>;

const PETAL = "M0,0C-6.5,-3.5 -8,-13 0,-18C8,-13 6.5,-3.5 0,0Z";
/** Inner-glow width as a share of the limb's width, by depth. */
export const HEART = [0, 0.4, 0.45, 0.55, 0.6];

const timing = (limb: Limb) => cssVars({ "--start": `${limb.start}ms`, "--dur": `${limb.dur}ms` });
/** One growing stroke carries its own class and timing... */
const grow = (limb: Limb) => (limb.depth > 1 ? "hero-grow hero-twig" : "hero-grow");
/** ...a stack of them shares its group's: one animation per limb, and every child <use> inherits the dash. */
const grows = (limb: Limb) => (limb.depth > 1 ? "hero-grows hero-twig" : "hero-grows");

/** Plum blossom (ume): five rounded petals, the two lower ones shaded, warm stamens. */
export function Ume({ id }: { id: string }) {
  return (
    <symbol id={id} viewBox="-20 -20 40 40" overflow="visible">
      <g fill="var(--hero-petal)">
        {[0, 72, 144, 216, 288].map((deg) => (
          <path key={deg} d={PETAL} transform={deg ? `rotate(${deg})` : undefined} />
        ))}
      </g>
      <g fill="var(--hero-petal-shade)" opacity=".55">
        <path d={PETAL} transform="rotate(144)" />
        <path d={PETAL} transform="rotate(216)" />
      </g>
      <path
        d="M0,0L0,-6.5M0,0L5.2,-3.9M0,0L-5.2,-3.9M0,0L3.6,4.2M0,0L-3.6,4.2"
        stroke="var(--hero-petal-core)"
        strokeWidth=".8"
        strokeLinecap="round"
      />
      <circle r="3.2" fill="var(--hero-petal-core)" opacity=".35" />
      <circle r="1.6" fill="var(--hero-petal-core)" />
    </symbol>
  );
}

export function HeroBough({ name, className, depth }: { name: BoughName; className: string; depth?: number }) {
  const { id, viewBox, limbs, buds, flowers } = BOUGHS[name];
  const spine = (i: number) => `#${id}-s${i}`;
  const step = (limb: Limb, i: number, k: number) => (limb.steps[k].d === null ? spine(i) : `#${id}-t${i}-${k}`);
  const main = limbs[0];
  // Twigs first and trunk last, so every parent's wood covers its children's bases.
  const order = limbs.map((limb, i) => [limb, i] as const).reverse();
  const [vw, vh] = viewBox.split(" ").slice(2).map(Number);

  return (
    <div className={`hero-bough ${className}`} data-depth={depth} aria-hidden="true">
      <svg className="hero-bough-halo" viewBox={viewBox} focusable="false">
        <g fill="none" stroke="var(--hero-ember)" strokeLinecap="round">
          {limbs.map((limb, i) => (
            <use key={i} href={spine(i)} className={grow(limb)} strokeWidth={n1(limb.w0 * 0.9 + 6)} style={timing(limb)} />
          ))}
        </g>
      </svg>

      <svg className="hero-bough-wood" viewBox={viewBox} focusable="false">
        <defs>
          {/* Wood grain: lit toward the moon (upper left), shaded away from it */}
          <linearGradient id={`${id}-grain`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={vw} y2={vh}>
            <stop offset="0" stopColor="var(--hero-wood-lit)" />
            <stop offset="1" stopColor="var(--hero-wood)" />
          </linearGradient>
          {limbs.map((limb, i) => (
            <Fragment key={i}>
              <path id={`${id}-s${i}`} d={limb.spine} pathLength={1} />
              {limb.steps.map((s, k) => s.d && <path key={k} id={`${id}-t${i}-${k}`} d={s.d} pathLength={s.len} />)}
              {limb.outline && (
                <>
                  <path id={`${id}-o${i}`} d={limb.outline} />
                  {/* Default region (the limb's box plus 10%); alpha type, set in hero.css */}
                  <mask id={`${id}-m${i}`}>
                    <use
                      href={spine(i)}
                      className={grow(limb)}
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

        {order.map(([limb, i]) =>
          limb.outline ? (
            <g key={i} mask={`url(#${id}-m${i})`}>
              {/* Moon rim: the outline nudged toward the key light, showing past the wood's upper-left edge */}
              <use href={`#${id}-o${i}`} fill="var(--hero-wood-rim)" transform="translate(-1.2 -1.2)" />
              <use href={`#${id}-o${i}`} fill={`url(#${id}-grain)`} />
            </g>
          ) : (
            <g key={i} className={grows(limb)} style={timing(limb)} fill="none" stroke={`url(#${id}-grain)`} strokeLinecap="round">
              {limb.steps.map((s, k) => (
                <use key={k} href={step(limb, i, k)} strokeWidth={s.w} />
              ))}
            </g>
          ),
        )}
      </svg>

      <svg className="hero-bough-heart" viewBox={viewBox} focusable="false">
        <g fill="none" stroke="var(--hero-wood-heart)" strokeLinecap="round">
          {limbs.map((limb, i) => (
            <g key={i} className={grows(limb)} style={timing(limb)}>
              {limb.steps.map((s, k) => (
                <use key={k} href={step(limb, i, k)} strokeWidth={n1(s.w * HEART[limb.depth])} />
              ))}
            </g>
          ))}
        </g>
      </svg>

      {/* Buds: their own layer, so the idle breath is a composited fade */}
      <svg className="hero-buds" viewBox={viewBox} focusable="false">
        <defs>
          {/* An ember dot with a faint glow and a white-hot core */}
          <g id={`${id}-bud`}>
            <circle r="5" fill="var(--hero-ember)" opacity=".22" />
            <circle r="2.2" fill="var(--hero-ember)" />
            <circle r="1" fill="color-mix(in srgb, var(--hero-ember) 35%, white)" />
          </g>
        </defs>
        {buds.map((bud) => (
          <g key={`${bud.x},${bud.y}`} className="hero-bud" style={cssVars({ "--at": `${bud.at}ms` })}>
            <use href={`#${id}-bud`} x={bud.x} y={bud.y} />
          </g>
        ))}
      </svg>

      <svg viewBox={viewBox} focusable="false">
        <defs>
          <Ume id={`${id}-ume`} />
        </defs>
        {flowers.map((f) => (
          <g key={`${f.x},${f.y}`} transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}>
            <g className="hero-flower" style={cssVars({ "--at": `${f.at}ms` })}>
              <use href={`#${id}-ume`} x={n1(-f.size * 0.8)} y={n1(-f.size * 0.8)} width={n1(f.size * 1.6)} height={n1(f.size * 1.6)} />
            </g>
          </g>
        ))}
        {/* Leading ember riding the main limb's growth front (omitted without CSS motion-path support) */}
        <g className="hero-ember" fill="var(--hero-ember)" style={{ ...timing(main), offsetPath: `path("${main.spine}")` }}>
          <circle r="7" opacity=".3" />
          <circle r="3" />
          <circle r="1.4" fill="color-mix(in srgb, var(--hero-ember) 35%, white)" />
        </g>
      </svg>
    </div>
  );
}
