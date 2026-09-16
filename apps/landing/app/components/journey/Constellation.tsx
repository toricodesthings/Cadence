import { cssVars, n1 } from "~/lib/geometry";
import { CONSTELLATION } from "~/lib/site";

import { BoughSegment, segmentHeight } from "./BoughSegment";

/*
 * The small things, done with care: a constellation chart (the game's, and the page's own vocabulary). Nine
 * named stars joined into one figure (a head that closes, a neck, a body that closes, a tail: the year comes
 * round twice), drawn line by line as the section is read, among a few faint stars with no names.
 *
 * The chart is the list: a real <ul>, read in order. On wide screens each item is a zero-size anchor at its
 * star, the glyph centred on it and the name set off to one side. Stars left of the figure's spine wear their
 * names on the left and right-hand stars on the right, and every line leaves its star inward, so no line
 * ever crosses a name. Narrow screens get the same list stacked, with no drawing.
 *
 * Units: the drawing is 100 × 110, the chart's own aspect, so it scales evenly and a line's dash can be
 * measured along it (a non-scaling stroke would break `pathLength`, and the lines would draw in pieces).
 */

type Side = "l" | "r";

/** [x, y, side, bright], in the copy's order. Stars keep to x 36–64, so a name has room on its side at 1024. */
const STARS: readonly (readonly [number, number, Side, boolean])[] = [
  [38, 8, "l", true],
  [60, 15, "r", false],
  [58, 34, "r", false],
  [40, 40, "l", true],
  [42, 59, "l", false],
  [64, 62, "r", true],
  [60, 82, "r", true],
  [36, 86, "l", false],
  [56, 103, "r", false],
];

/** The figure, one line at a time, in the order it is drawn: the head, the neck, the body, the tail. */
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [3, 4],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [6, 8],
];

/** Faint stars with no names, in the gaps between the names. */
const DUST: readonly (readonly [number, number])[] = [
  [50, 26], [52, 48], [47, 72], [46, 95], [74, 47], [26, 24],
  [22, 70], [82, 91], [84, 24], [18, 100], [92, 72], [10, 49],
];

/** Where the drawing runs in the section's scroll, and each line's share of it. */
const DRAW_FROM = 0.14;
const DRAW_SPAN = 0.46;

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
        <svg viewBox="0 0 100 110" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {DUST.map(([x, y]) => (
            <circle key={`${x},${y}`} className="constellation-dust" cx={x} cy={y} r=".26" />
          ))}
          {EDGES.map(([a, b], k) => (
            <path
              key={k}
              className="constellation-line"
              d={`M${STARS[a][0]},${STARS[a][1]}L${STARS[b][0]},${STARS[b][1]}`}
              pathLength={1}
              style={cssVars({
                "--d0": n1((DRAW_FROM + (k * DRAW_SPAN) / EDGES.length) * 100) / 100,
                "--d1": n1((DRAW_FROM + ((k + 1) * DRAW_SPAN) / EDGES.length) * 100) / 100,
              })}
            />
          ))}
        </svg>
        <ul className="constellation-stars">
          {CONSTELLATION.stars.map((star, k) => {
            const [x, y, side, bright] = STARS[k];
            return (
              <li
                key={star.name}
                className="reveal"
                data-side={side}
                data-bright={bright || undefined}
                style={cssVars({ "--x": `${x}%`, "--y": `${n1(y / 1.1)}%`, "--i": 2 + k * 0.4 })}
              >
                <span className="glint-star" aria-hidden="true" />
                <span className="star-text">
                  <span className="star-name font-display">{star.name}</span>
                  <span className="star-gloss">{star.gloss}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
