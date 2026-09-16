import { Fragment, useEffect, useRef } from "react";

import { cssVars, n1, pt, rng } from "~/lib/geometry";
import { CHAPTERS, PRELUDE } from "~/lib/site";
import { watchViewport } from "~/lib/viewport";

import { BoughSegment, segmentHeight } from "./BoughSegment";
import { Chapter } from "./Chapter";
import { Constellation } from "./Constellation";
import { Drift } from "./Drift";
import { Emilie } from "./Emilie";
import { Finale } from "./Finale";
import { Panel } from "./Panel";

/*
 * The journey: one year on one weeping bough. Four chapters wear the four
 * seasons (and four of the app's palettes), Emilie keeps the lantern between
 * autumn and winter, and the finale is spring returning. The night deepens as
 * you descend, so what's lit is the content. Everything that moves is bound to
 * scroll in CSS (journey.css). The only JS is one viewport watcher (lib/viewport.ts,
 * not an IntersectionObserver, which would cost every running loop a main-thread
 * frame): it pauses sections that are out of view and, where the browser has no
 * scroll timelines, grows each section's bough once on entry.
 */

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

const LEAD_WORDS = PRELUDE.lead.split(" ");

/** Sparkles that kindle round "whole year": [left %, top %, delay s]. */
const YEAR_SPARKS: readonly (readonly [number, number, number])[] = [
  [-5, 8, 0],
  [104, -6, 1.9],
  [62, -34, 3.7],
];

export function Journey() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const scrubs = CSS.supports("animation-timeline: view()");
    // Without scroll timelines the boughs grow on a clock; until now they were simply drawn.
    if (!scrubs) root.classList.add("is-live");
    // The sections, and the mist over the seam: it belongs to no section, and its drift would run on far offscreen.
    // Loops pause at the screen's edge (a loop off screen falls back to the main thread); a section's bough and
    // particles are dropped only a quarter screen out, more than any limb overhangs its section, so nothing pops.
    return watchViewport(
      Array.from(root.querySelectorAll(".jsec, .finale, .journey-mist")),
      (section, share, near) => {
        section.classList.toggle("is-offscreen", share === 0);
        section.classList.toggle("is-far", !near);
        if (!scrubs && share >= 0.2) section.classList.add("is-grown");
      },
      { steps: [0.2], margin: 0.25 },
    );
  }, []);

  return (
    <section ref={ref} className="journey" aria-labelledby="journey-title">
      <div className="journey-sky" aria-hidden="true">
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
      </div>
      <div className="journey-fade" aria-hidden="true" />
      {/* The valley's weather over the seam, so the hero's ground and the journey's sky are one night */}
      <div className="journey-mist" aria-hidden="true">
        <span />
        <span />
      </div>
      <h2 id="journey-title" className="sr-only">
        What Cadence is
      </h2>

      <div className="jsec prelude" style={cssVars({ "--h": segmentHeight("prelude") })}>
        <BoughSegment name="prelude" />
        <Drift kind="lantern" />
        <div className="prelude-words">
          {/* Lit word by word as it is read (journey.css) */}
          <p className="prelude-lead font-display">
            {LEAD_WORDS.map((word, k) => (
              <Fragment key={k}>
                {k > 0 && " "}
                <span className="prelude-word" style={cssVars({ "--w": k })}>
                  {word}
                </span>
              </Fragment>
            ))}
          </p>
          <div className="prelude-crest reveal" style={cssVars({ "--i": 0 })} aria-hidden="true">
            <span className="prelude-crest-line prelude-crest-line-l" />
            <span className="glint-star prelude-crest-star" />
            <span className="prelude-crest-line prelude-crest-line-r" />
          </div>
          <p className="prelude-line reveal font-display" style={cssVars({ "--i": 1 })}>
            {PRELUDE.line}{" "}
            <span className="prelude-year">
              {PRELUDE.year}
              <svg className="prelude-swash" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <defs>
                  {/* Gold, fading in from the left and brightest where the stroke ends */}
                  <linearGradient id="prelude-swash" x1="0" x2="1">
                    <stop offset="0" stopColor="var(--hero-crest)" stopOpacity="0.2" />
                    <stop offset="0.7" stopColor="var(--hero-crest)" />
                    <stop offset="1" stopColor="color-mix(in srgb, var(--hero-crest) 50%, white)" />
                  </linearGradient>
                </defs>
                <path className="prelude-swash-ink" d="M3,11C46,3 118,2 197,8" pathLength={1} />
              </svg>
              {YEAR_SPARKS.map(([x, y, d]) => (
                <span key={x} className="prelude-spark" style={cssVars({ "--x": `${x}%`, "--y": `${y}%`, "--d": `${d}s` })} aria-hidden="true" />
              ))}
            </span>
            .
          </p>
        </div>
      </div>

      <Chapter copy={CHAPTERS.capture} segment="spring" drift="petal">
        <Panel />
      </Chapter>
      <Chapter copy={CHAPTERS.plan} segment="summer" prev="spring" drift="firefly">
        <Panel />
      </Chapter>
      <Chapter copy={CHAPTERS.time} segment="autumn" prev="summer" drift="leaf">
        <Panel />
      </Chapter>
      <Emilie />
      <Chapter copy={CHAPTERS.rhythm} segment="winter" drift="snow">
        <Panel />
      </Chapter>

      <Constellation />

      <Finale />
    </section>
  );
}
