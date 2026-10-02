import { cssVars, n1 } from "~/lib/geometry";
import { CONSTELLATION } from "~/lib/site";

import { BoughSegment, mobileBoughSide, segmentHeight } from "./BoughSegment";

/*
 * The small things, done with care: a constellation chart (the game's, and the page's own vocabulary). Nine
 * named stars joined into one figure, drawn line by line as the section is read. The wide chart has a
 * faceted spine, satellite stars and quiet orbital traces; the portrait chart keeps its folded ribbon.
 *
 * The chart is the list: a real <ul>, read in order. On wide screens each item is a zero-size anchor at its
 * star, the glyph centred on it and the name set off to one side. Stars left of the figure's spine wear their
 * names on the left and right-hand stars on the right, and every line leaves its star inward, so no line
 * ever crosses a name. Narrow screens recompose the same stars into a tall figure with alternating labels
 * and a few companion stars: the drawing stays between the words, even when the glosses wrap.
 *
 * Units: both drawings are 100 wide, with heights of 88 and 300. Each line's dash is measured in its own
 * drawing (a non-scaling stroke would break `pathLength`, and the lines would draw in pieces).
 */

type Side = "l" | "r";

/** [x, y, side, bright], in the copy's order. Stars keep to x 36–64, so a name has room on its side at 1024. */
const STARS: readonly (readonly [number, number, Side, boolean])[] = [
  [37, 7, "l", true],
  [63, 13, "r", false],
  [59, 29, "r", false],
  [39, 34, "l", true],
  [42, 49, "l", false],
  [64, 53, "r", true],
  [60, 69, "r", true],
  [36, 73, "l", false],
  [56, 83, "r", false],
];

/** Portrait coordinates: a folded ribbon of light, with room to read on either side. */
const MOBILE_STARS: readonly (readonly [number, number, Side])[] = [
  [43, 12, "l"], [61, 45, "r"], [39, 78, "l"],
  [59, 111, "r"], [42, 144, "l"], [57, 177, "r"],
  [38, 210, "l"], [60, 243, "r"], [44, 276, "l"],
];

/** [x, y, first neighbour, second neighbour]: small facets around the main figure. */
const COMPANIONS: readonly (readonly [number, number, number, number])[] = [
  [53, 3, 0, 1], [66, 27, 0, 1], [48, 94, 2, 3],
  [53, 158, 4, 5], [51, 225, 6, 7], [51, 294, 7, 8],
];

const WIDE_COMPANIONS: typeof COMPANIONS = [
  [49, 2, 0, 1], [51, 20, 0, 2], [61, 23, 1, 2],
  [47, 39, 2, 3], [55, 44, 3, 5], [46, 44, 3, 4],
  [51, 61, 4, 6], [61, 63, 5, 6], [46, 78, 7, 8],
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
  [13, 8], [23, 3], [29, 17], [42, 19], [56, 6], [75, 4], [87, 13],
  [17, 26], [25, 38], [45, 28], [55, 34], [76, 35], [91, 28],
  [9, 48], [23, 56], [47, 55], [60, 40], [74, 46], [85, 55],
  [18, 67], [28, 82], [42, 65], [57, 76], [76, 78], [93, 71],
  [12, 84], [49, 87], [83, 86],
];

const MOBILE_DUST: readonly (readonly [number, number])[] = [
  [17, 5], [82, 14], [24, 37], [88, 66], [12, 93], [78, 100],
  [20, 122], [86, 136], [15, 162], [81, 191], [22, 234],
  [87, 259], [18, 287], [72, 296], [49, 57], [51, 192],
];

const CHARTS = [
  { name: "wide", height: 88, stars: STARS, dust: DUST, companions: WIDE_COMPANIONS },
  { name: "narrow", height: 300, stars: MOBILE_STARS, dust: MOBILE_DUST, companions: COMPANIONS },
] as const;

/** Where the drawing runs in the section's scroll, and each line's share of it. */
const DRAW_FROM = 0.14;
const DRAW_SPAN = 0.46;

export function Constellation() {
  return (
    <section
      className="jsec chapter constellation"
      data-panel="right"
      data-prev="winter"
      data-bough-side={mobileBoughSide("constellation")}
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
        {CHARTS.map(({ name, height, stars, dust, companions }) => (
          <svg
            key={name}
            className={`constellation-map-${name}`}
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            {name === "wide" && (
              <g className="constellation-orbits">
                <ellipse cx="51" cy="43" rx="28" ry="38" transform="rotate(18 51 43)" />
                <ellipse cx="51" cy="43" rx="21" ry="32" transform="rotate(-24 51 43)" />
                <path d="M49,0v3M49,85v3M18,43h3M81,43h3" />
              </g>
            )}
            {dust.map(([x, y]) => (
              <circle key={`${x},${y}`} className="constellation-dust" cx={x} cy={y} r=".26" />
            ))}
            {EDGES.map(([a, b], k) => (
              <path
                key={k}
                className="constellation-line"
                d={`M${stars[a][0]},${stars[a][1]}L${stars[b][0]},${stars[b][1]}`}
                pathLength={1}
                style={cssVars({
                  "--d0": n1((DRAW_FROM + (k * DRAW_SPAN) / EDGES.length) * 100) / 100,
                  "--d1": n1((DRAW_FROM + ((k + 1) * DRAW_SPAN) / EDGES.length) * 100) / 100,
                })}
              />
            ))}
            {companions.map(([x, y, a, b], k) => (
              <g key={k}>
                <path
                  className="constellation-line constellation-companion-line"
                  d={`M${stars[a][0]},${stars[a][1]}L${x},${y}L${stars[b][0]},${stars[b][1]}`}
                  pathLength={1}
                  style={cssVars({ "--d0": 0.2 + k * 0.06, "--d1": 0.26 + k * 0.06 })}
                />
                <circle className="constellation-companion" cx={x} cy={y} r=".45" />
              </g>
            ))}
            {name === "wide" && stars.map(([x, y], k) => (
              <g key={`halo-${k}`} className="constellation-node-halo">
                <circle cx={x} cy={y} r={STARS[k][3] ? 1.8 : 1.2} />
                {STARS[k][3] && <circle className="constellation-node-ring" cx={x} cy={y} r="2.6" />}
              </g>
            ))}
          </svg>
        ))}
        <ul className="constellation-stars">
          {CONSTELLATION.stars.map((star, k) => {
            const [x, y, side, bright] = STARS[k];
            const [mx, my, mobileSide] = MOBILE_STARS[k];
            return (
              <li
                key={star.name}
                className="reveal"
                data-side={side}
                data-mobile-side={mobileSide}
                data-bright={bright || undefined}
                style={cssVars({
                  "--x": `${x}%`, "--y": `${n1(y / 0.88)}%`,
                  "--mx": `${mx}%`, "--my": `${n1(my / 3)}%`, "--i": 2 + k * 0.4,
                })}
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
