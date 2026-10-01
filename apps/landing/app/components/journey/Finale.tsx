import { ButtonLink } from "~/components/ButtonLink";
import { ArrowIcon } from "~/components/icons";
import { cssVars, n1, pt, rng } from "~/lib/geometry";
import { FINALE, SIGN_UP_URL } from "~/lib/site";

import { BoughSegment, segmentHeight } from "./BoughSegment";
import { Drift } from "./Drift";
import { FinaleLand } from "./FinaleLand";
import { Sigil } from "./Sigil";

/* The crown opens over a quiet invitation. Petals, lanterns and the valley carry the fantasy scenery;
 * the stationary blossom frames one glass link, followed by a single reassurance. */

const dot = (x: number, y: number, r: number) =>
  `M${pt(x - r, y)}a${r},${r} 0 1,0 ${n1(2 * r)},0a${r},${r} 0 1,0 ${n1(-2 * r)},0`;

/** Faint fixed stars, denser high up: one path per warmth. */
const STARS = (() => {
  const rand = rng(131);
  let cool = "";
  let warm = "";
  for (let i = 0; i < 164; i++) {
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
    out.push({ x, y, s: 7 + rand() * 8, dur: 12 + rand() * 10, delay: -rand() * 8 });
  }
  return out;
})();

export function Finale() {
  return (
    <section className="finale" aria-labelledby="finale-title">
      <div className="finale-sky" aria-hidden="true">
        {/* The hero's moon rises upper left and sets as you leave it; this one has crossed the whole night and
            stands high on the other side, softer for it. Its own box, in the sky's own units, so it is never
            cropped with the star field */}
        <span className="finale-moon" />
        <div className="finale-starlight">
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
      </div>

      <div className="jsec finale-crown" style={cssVars({ "--h": segmentHeight("finale") })}>
        <BoughSegment name="finale" />
      </div>
      <Drift kind="fall" />
      {/* The village's lanterns again, rising past the invitation: the same night, a year on */}
      <Drift kind="lantern" className="finale-lanterns" />

      <div className="finale-stage">
        <h3 id="finale-title" className="finale-title font-display">
          {FINALE.title}
        </h3>
        <p className="finale-body">
          {FINALE.body}
        </p>
        <div className="finale-invitation">
          <div className="finale-action-frame">
            <Sigil className="finale-blossom" blossom />
            <ButtonLink className="finale-action" ornate={false} sideAccents href={SIGN_UP_URL} data-cloud="">
              {FINALE.invite}
              <ArrowIcon className="button-icon button-arrow" />
            </ButtonLink>
          </div>
          <p className="finale-reassurance">{FINALE.reassurance}</p>
        </div>
      </div>

      <FinaleLand />
    </section>
  );
}
