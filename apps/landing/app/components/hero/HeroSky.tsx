import { cssVars, n1, pt, rng, type Pt } from "~/lib/geometry";

/*
 * Night sky on the loading screen's 1920×1080 stage (overscanned like `slice`,
 * so star density holds at every aspect). Stars fade in by tier as six paths
 * plus the four brightest as their own groups; twinkles are paired radial
 * gradients animated on opacity.
 */

type Star = { x: number; y: number; r: number; warm: boolean };

/** Upper-left, where the boughs' moonlit rims say the light comes from. */
const MOON: Pt = [420, 230];
const MARIA = "M404,222a9,7 0 1,0 18,0a9,7 0 1,0 -18,0M426,238a6,5 0 1,0 12,0a6,5 0 1,0 -12,0M412,244a5,3.5 0 1,0 10,0a5,3.5 0 1,0 -10,0";

/** [count, radius]; the brightest tier is placed first so it gets the best sky. */
const TIERS: readonly (readonly [number, number])[] = [
  [10, 1.8],
  [26, 1.1],
  [40, 0.6],
];

const STARS: Star[][] = (() => {
  const rand = rng(17);
  const all: Star[] = [];
  return TIERS.map(([count, r]) => {
    const tier: Star[] = [];
    for (let guard = 0; tier.length < count && guard < 8000; guard++) {
      const x = 24 + rand() * 1872;
      // Denser toward the zenith, thinning toward the horizon.
      const y = 24 + 1020 * rand() * (0.35 + 0.65 * rand());
      const warm = rand() < 0.3;
      // Keep-out ellipse around the wordmark.
      const ex = (x - 960) / 520;
      const ey = (y - 540) / 180;
      if (ex * ex + ey * ey < 1) continue;
      const mx = x - MOON[0];
      const my = y - MOON[1];
      if (mx * mx + my * my < 170 * 170) continue;
      if (all.some((s) => Math.abs(s.x - x) < 60 && Math.abs(s.y - y) < 44)) continue;
      const star = { x, y, r, warm };
      tier.push(star);
      all.push(star);
    }
    return tier;
  });
})();

const BIG = STARS[0].slice(0, 4);

const starPath = (stars: readonly Star[]) =>
  stars
    .map(
      ({ x, y, r }) =>
        `M${pt(x - r, y)}a${r},${r} 0 1,0 ${n1(2 * r)},0a${r},${r} 0 1,0 ${n1(-2 * r)},0`,
    )
    .join("");

/** [stars, class] for the six faded-in paths (cool + warm per tier). */
const TIER_PATHS: readonly (readonly [readonly Star[], string])[] = [
  [STARS[2], "hero-star-t1"],
  [STARS[1], "hero-star-t2"],
  [STARS[0].slice(4), "hero-star-t3"],
];

/** Four twinklers, each a pair of distant stars sharing one opacity animation. */
const TWINKLE_PAIRS: readonly { a: Pt; b: Pt; dur: number; delay: number }[] = [
  { a: [1320, 120], b: [1540, 236], dur: 4.3, delay: -1.2 },
  { a: [180, 300], b: [330, 170], dur: 5.9, delay: -3.1 },
  { a: [1700, 380], b: [1830, 160], dur: 7.1, delay: -0.4 },
  { a: [620, 110], b: [760, 210], dur: 8.3, delay: -5.2 },
];

function twinkleStyle({ a, b, dur, delay }: (typeof TWINKLE_PAIRS)[number]) {
  const x0 = Math.min(a[0], b[0]) - 8;
  const y0 = Math.min(a[1], b[1]) - 8;
  const w = Math.abs(a[0] - b[0]) + 16;
  const h = Math.abs(a[1] - b[1]) + 16;
  const at = ([x, y]: Pt) => `${n1(((x - x0) / w) * 100)}% ${n1(((y - y0) / h) * 100)}%`;
  return cssVars({
    left: `${n1(x0 / 19.2)}%`,
    top: `${n1(y0 / 10.8)}%`,
    width: `${n1(w / 19.2)}%`,
    height: `${n1(h / 10.8)}%`,
    background: `radial-gradient(circle calc(2.6 * var(--su)) at ${at(a)}, var(--hero-star-cool) 30%, transparent), radial-gradient(circle calc(2.2 * var(--su)) at ${at(b)}, var(--hero-star-warm) 30%, transparent)`,
    "--tw": `${dur}s`,
    "--delay": `${delay}s`,
  });
}

export function HeroSky() {
  return (
    <>
      <div className="hero-layer hero-sky" aria-hidden="true" />
      <div className="hero-layer hero-dusk" aria-hidden="true" />
      <div className="hero-stage" data-depth={4} aria-hidden="true">
        {/* The moon in its own box, so it sets on the hero's scroll by a composited transform (hero.css); the
            box moves, not the <svg>, since Chrome composites no transform on an <svg> element */}
        <div className="hero-moon">
          <svg className="hero-stars" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="hs-moon-wide">
                <stop offset="0" stopColor="var(--hero-moon-halo)" stopOpacity=".14" />
                <stop offset="1" stopColor="var(--hero-moon-halo)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hs-moon-near">
                <stop offset=".25" stopColor="var(--hero-moon)" stopOpacity=".14" />
                <stop offset="1" stopColor="var(--hero-moon)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="hero-star-t3">
              <circle cx={MOON[0]} cy={MOON[1]} r="280" fill="url(#hs-moon-wide)" />
              <circle cx={MOON[0]} cy={MOON[1]} r="96" fill="url(#hs-moon-near)" />
              <circle cx={MOON[0]} cy={MOON[1]} r="22" fill="var(--hero-moon)" opacity=".62" />
              <path d={MARIA} fill="var(--hero-sky-zenith)" opacity=".07" />
            </g>
          </svg>
        </div>
        <svg className="hero-stars" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
          {TIER_PATHS.flatMap(([stars, cls]) => [
            <path key={`${cls}c`} className={cls} d={starPath(stars.filter((s) => !s.warm))} fill="var(--hero-star-cool)" />,
            <path key={`${cls}w`} className={cls} d={starPath(stars.filter((s) => s.warm))} fill="var(--hero-star-warm)" />,
          ])}
          {BIG.map((s, i) => (
            <g
              key={i}
              className="hero-star-big"
              fill={s.warm ? "var(--hero-star-warm)" : "var(--hero-star-cool)"}
              style={cssVars({ "--at": `${240 + i * 60}ms` })}
            >
              <circle cx={n1(s.x)} cy={n1(s.y)} r="2.3" />
              {/* 4-point sparkle: two thin crossed lines */}
              <path
                d={`M${pt(s.x - 8, s.y)}L${pt(s.x + 8, s.y)}M${pt(s.x, s.y - 8)}L${pt(s.x, s.y + 8)}`}
                stroke={s.warm ? "var(--hero-star-warm)" : "var(--hero-star-cool)"}
                strokeWidth=".6"
                opacity=".5"
              />
            </g>
          ))}
        </svg>
        <div className="hero-twinkles hero-rm-hide">
          {TWINKLE_PAIRS.map((pair) => (
            <div key={pair.dur} className="hero-twinkle" style={twinkleStyle(pair)} />
          ))}
        </div>
        <div className="hero-rm-hide">
          <span className="hero-comet hero-comet-a" />
          <span className="hero-comet hero-comet-b" />
        </div>
      </div>
    </>
  );
}
