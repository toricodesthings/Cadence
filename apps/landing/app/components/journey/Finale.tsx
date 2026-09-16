import { ArrowIcon } from "~/components/icons";
import { cssVars, n1, pt, rng } from "~/lib/geometry";
import { FINALE, SIGN_UP_URL, VOWS } from "~/lib/site";

import { BoughSegment, segmentHeight } from "./BoughSegment";
import { Drift } from "./Drift";
import { FinaleLand } from "./FinaleLand";
import { Sigil } from "./Sigil";

/*
 * The finale: the page's climax, and the one place motion is generous. The bough opens into its crown,
 * petals fall from it through a night deeper than the chapters', a dozen stars blink, and the second
 * valley wakes under first light. One invitation, set in a sigil; then the vows, then the ground the
 * footer stands on. Nothing here repeats the hero's buttons.
 */

const dot = (x: number, y: number, r: number) =>
  `M${pt(x - r, y)}a${r},${r} 0 1,0 ${n1(2 * r)},0a${r},${r} 0 1,0 ${n1(-2 * r)},0`;

/** Faint fixed stars, denser high up: one path per warmth. */
const STARS = (() => {
  const rand = rng(131);
  let cool = "";
  let warm = "";
  for (let i = 0; i < 124; i++) {
    const x = 16 + rand() * 1888;
    const y = 16 + 1100 * rand() * (0.3 + 0.7 * rand());
    const r = n1(0.5 + rand() * 0.9);
    if (rand() < 0.3) warm += dot(x, y, r);
    else cool += dot(x, y, r);
  }
  return { cool, warm };
})();

/** Stars that blink: four-point sparkles, clear of the words in the middle of the scene. */
const BLINKS = (() => {
  const rand = rng(137);
  const out: { x: number; y: number; s: number; dur: number; delay: number }[] = [];
  for (let guard = 0; out.length < 17 && guard < 700; guard++) {
    const x = 3 + rand() * 94;
    const y = 4 + rand() * 60;
    if (x > 28 && x < 72 && y > 24 && y < 64) continue;
    if (out.some((b) => Math.abs(b.x - x) < 7.5 && Math.abs(b.y - y) < 7.5)) continue;
    out.push({ x, y, s: 7 + rand() * 8, dur: 3.4 + rand() * 5, delay: -rand() * 8 });
  }
  return out;
})();

/** The seal's gems, set into its disc on the quarters. */
const SEAL_GEMS = [0, 90, 180, 270];

/** Sparkles that flare on the disc's rim now and then: [angle deg, size px, delay s]. */
const SEAL_STARS: readonly (readonly [number, number, number])[] = [
  [-38, 13, 0],
  [62, 10, 2.3],
  [148, 12, 4.6],
  [232, 9, 1.2],
];

export function Finale() {
  return (
    <section className="finale" aria-labelledby="finale-title">
      <div className="finale-sky" aria-hidden="true">
        {/* The hero's moon rises upper left and sets as you leave it; this one has crossed the whole night and
            stands high on the other side, softer for it. Its own box, in the sky's own units, so it is never
            cropped with the star field */}
        <span className="finale-moon" />
        <svg className="finale-stars" viewBox="0 0 1920 1200" preserveAspectRatio="xMidYMin slice" focusable="false">
          <path d={STARS.cool} fill="var(--hero-star-cool)" />
          <path d={STARS.warm} fill="var(--hero-star-warm)" />
        </svg>
        {BLINKS.map((b, k) => (
          <span
            key={k}
            className="blink"
            style={cssVars({
              "--x": `${n1(b.x)}%`,
              "--y": `${n1(b.y)}%`,
              "--s": `${n1(b.s)}px`,
              "--dur": `${n1(b.dur)}s`,
              "--delay": `${n1(b.delay)}s`,
            })}
          />
        ))}
      </div>

      <div className="jsec finale-crown" style={cssVars({ "--h": segmentHeight("finale") })}>
        <BoughSegment name="finale" />
      </div>
      <Drift kind="fall" />
      {/* The village's lanterns again, rising past the invitation: the same night, a year on */}
      <Drift kind="lantern" className="finale-lanterns" />

      <div className="finale-stage">
        <h3 id="finale-title" className="finale-title reveal font-display" style={cssVars({ "--i": 0 })}>
          {FINALE.title}
        </h3>
        <p className="finale-body reveal" style={cssVars({ "--i": 1 })}>
          {FINALE.body}
        </p>
        <div className="finale-seal reveal" style={cssVars({ "--i": 0 })}>
          {/* One object: the whole seal answers the pointer, but only its disc is the link */}
          <a className="seal" href={SIGN_UP_URL} data-cloud="">
            <Sigil className="seal-rings" blossom />
            <span className="seal-comet seal-comet-inner" aria-hidden="true" />
            <span className="seal-comet seal-comet-outer" aria-hidden="true" />
            <span className="seal-glass" aria-hidden="true" />
            <span className="seal-aura" aria-hidden="true" />
            {SEAL_GEMS.map((a) => (
              <span key={a} className="seal-gem" style={cssVars({ "--a": `${a}deg` })} aria-hidden="true" />
            ))}
            {SEAL_STARS.map(([a, size, delay]) => (
              <span
                key={a}
                className="seal-star"
                style={cssVars({ "--a": `${a}deg`, "--size": `${size}px`, "--d": `${delay}s` })}
                aria-hidden="true"
              />
            ))}
            <span className="seal-label font-display">
              {FINALE.invite}
              <span className="seal-arrow" aria-hidden="true">
                <span className="seal-hair" />
                <ArrowIcon className="seal-arrow-icon" />
                <span className="seal-hair" />
              </span>
            </span>
          </a>
        </div>
        <p className="seal-nudge reveal" style={cssVars({ "--i": 0 })}>
          {FINALE.nudge}
        </p>
        <ul className="finale-vows">
          {VOWS.map((vow, k) => (
            <li key={vow.title} className="vow reveal" style={cssVars({ "--i": k })}>
              <span className="vow-gem" aria-hidden="true" />
              {vow.href ? (
                <a className="vow-title vow-link font-display" href={vow.href}>
                  {vow.title}
                </a>
              ) : (
                <span className="vow-title font-display">{vow.title}</span>
              )}
              <span className="vow-line">{vow.line}</span>
            </li>
          ))}
        </ul>
      </div>

      <FinaleLand />
    </section>
  );
}
