import { cssVars, n1, pt, rng } from "~/lib/geometry";

const TINTS = ["spring", "summer", "autumn", "winter"] as const;

/** The sticky sky's stars: faint, fixed to the screen like a real sky, one path per warmth. */
const SKY = (() => {
  const rand = rng(83);
  let cool = "";
  let warm = "";
  for (let i = 0; i < 46; i++) {
    const x = 20 + rand() * 1880;
    const y = 20 + rand() * 1040;
    const r = n1(0.5 + rand() * 0.7);
    const d = `M${pt(x - r, y)}a${r},${r} 0 1,0 ${n1(2 * r)},0a${r},${r} 0 1,0 ${n1(-2 * r)},0`;
    if (rand() < 0.28) warm += d;
    else cool += d;
  }
  return { cool, warm };
})();

/** Four stars that twinkle in the sticky sky: [x %, y %, duration s, delay s]. */
const TWINKLES: readonly (readonly [number, number, number, number])[] = [
  [11, 16, 5.3, -1.4],
  [83, 11, 6.7, -3.9],
  [66, 36, 7.9, -0.8],
  [24, 42, 4.9, -2.6],
];

export function SkyBody() {
  return (
    <>
      <svg className="journey-stars" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" focusable="false">
        <path d={SKY.cool} fill="var(--hero-star-cool)" />
        <path d={SKY.warm} fill="var(--hero-star-warm)" />
      </svg>
      {TWINKLES.map(([x, y, dur, delay]) => (
        <span
          key={x}
          className="journey-twinkle"
          style={cssVars({ "--x": `${x}%`, "--y": `${y}%`, "--dur": `${dur}s`, "--delay": `${delay}s` })}
        />
      ))}
      {TINTS.map((season) => (
        <span key={season} className={`journey-tint journey-tint-${season}`} />
      ))}
    </>
  );
}
