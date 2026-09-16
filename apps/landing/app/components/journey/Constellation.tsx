import { cssVars, n1 } from "~/lib/geometry";
import { CONSTELLATION } from "~/lib/site";

import { BoughSegment, segmentHeight } from "./BoughSegment";

/*
 * The small things, done with care: a constellation chart (the game's, and the page's own vocabulary). Nine
 * stars on the night field, joined by one faint line that is drawn as the section is read, and each named
 * where it sits. The chart is the list: a real <ul>, so it is read in order, absolutely placed over the
 * drawing on wide screens and stacked plainly when there is no room. The lines and glows are aria-hidden.
 *
 * The ring is deliberate: it closes, the way the year does. The spur off it is the one star outside the ring.
 */

/**
 * [x, y] in percent of the chart, in the copy's order. Stars sit in six rows, at most two to a row and far
 * apart in it, so no name ever runs into its neighbour: a name reaches about a third of the field, and a star
 * past the middle wears its name on the other side (`flip`).
 */
const AT: readonly (readonly [number, number])[] = [
  [10, 5], [88, 5], [30, 21], [8, 37], [90, 37], [36, 53], [10, 69], [88, 69], [40, 85],
];

/** The figure: one closed ring through all nine, because the year closes. */
const RING = [0, 1, 4, 5, 7, 8, 6, 3, 2, 0];

const LINES = RING.map((i, k) => `${k ? "L" : "M"}${n1(AT[i][0])},${n1(AT[i][1])}`).join("");

export function Constellation() {
  return (
    <section
      className="jsec chapter constellation"
      data-panel="right"
      data-prev="winter"
      aria-labelledby="constellation-title"
      style={cssVars({ "--h": segmentHeight("constellation") })}
    >
      <BoughSegment name="constellation" />
      <div className="chapter-words">
        <p className="chapter-eyebrow reveal" style={cssVars({ "--i": 0 })}>
          {CONSTELLATION.eyebrow}
        </p>
        <h3 id="constellation-title" className="chapter-title reveal font-display" style={cssVars({ "--i": 1 })}>
          {CONSTELLATION.title}
        </h3>
      </div>

      <div className="chapter-panel constellation-chart">
        {/* The figure: one line, drawn on the section's scroll, and a soft glow under every star */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path className="constellation-line" d={LINES} pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
        <ul className="constellation-stars">
          {CONSTELLATION.stars.map((star, k) => (
            <li
              key={star.name}
              className="reveal"
              data-flip={AT[k][0] > 50 || undefined}
              style={cssVars({ "--x": `${AT[k][0]}%`, "--y": `${AT[k][1]}%`, "--i": 2 + k * 0.4 })}
            >
              <span className="glint-star" aria-hidden="true" />
              <span className="star-text">
                <span className="star-name font-display">{star.name}</span>
                <span className="star-gloss">{star.gloss}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
