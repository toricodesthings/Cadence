import { Fragment, useEffect, useRef } from "react";

import { StaticSvg } from "~/components/StaticSvg";
import { cssVars } from "~/lib/geometry";
import { CHAPTERS, PRELUDE } from "~/lib/site";
import { tendClip } from "~/lib/clip";
import { watchViewport } from "~/lib/viewport";

import { BoughSegment, segmentHeight } from "./BoughSegment";
import { Chapter } from "./Chapter";
import { Constellation } from "./Constellation";
import { Drift } from "./Drift";
import { Emilie } from "./Emilie";
import { Finale } from "./Finale";
import { Panel } from "./Panel";
import { SkyBody } from "./JourneySkyScene";

/*
 * The journey: one year on one weeping bough. Four chapters wear the four
 * seasons (and four of the app's palettes), Emilie keeps the lantern between
 * autumn and winter, Today carries it through the night after winter, and the
 * finale is spring returning. The night deepens as
 * you descend, so what's lit is the content. Everything that moves is bound to
 * scroll in CSS (journey.css). The only JS is one viewport watcher (lib/viewport.ts,
 * not an IntersectionObserver, which would cost every running loop a main-thread
 * frame): it pauses sections that are out of view and, where the browser has no
 * scroll timelines, grows each section's bough once on entry.
 */

const LEAD_SENTENCES = PRELUDE.lead.split(/(?<=\.)\s+/).map((sentence, i, sentences) => ({
  words: sentence.split(" "),
  start: sentences.slice(0, i).reduce((count, previous) => count + previous.split(" ").length, 0),
}));

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
    const finale = root.querySelector(".finale");
    const crown = root.querySelector(".finale-crown");
    let stopCrown: (() => void) | undefined;
    const onSection = (section: Element, share: number, near: boolean) => {
      section.classList.toggle("is-offscreen", share === 0);
      section.classList.toggle("is-far", !near);
      if (!scrubs && share >= 0.2) section.classList.add("is-grown");
      if (section === finale && near && !stopCrown && crown) {
        // The crown lives inside the finale, which the browser skips until it is near (content-visibility).
        // Measuring it earlier would force the whole finale to lay out during hydration.
        requestAnimationFrame(() => { stopCrown ??= watchViewport([crown], onSection, { steps: [0.2], margin: 0.25 }); });
      }
    };
    const stopSections = watchViewport(
      Array.from(root.querySelectorAll(":scope > .jsec, .finale, .journey-mist")),
      onSection,
      { steps: [0.2], margin: 0.25 },
    );
    // Mobile branches wait for their own area below the text or panel, including each crossing.
    const branches = Array.from(root.querySelectorAll(".prelude-branch, .bough-crossing"));
    const stopBranches = !scrubs
      ? watchViewport(branches, (el, share) => {
        if (share >= 0.2) el.classList.add("is-grown");
      }, { steps: [0.2] })
      : undefined;
    // Clips start downloading a screen ahead, so each is ready when its panel arrives, and play only while seen
    const stopClips = watchViewport(
      Array.from(root.querySelectorAll<HTMLVideoElement>(".panel-clip")),
      (el, share, near) => tendClip(el as HTMLVideoElement, near, share > 0),
      { margin: 1 },
    );
    return () => { stopSections(); stopCrown?.(); stopBranches?.(); stopClips(); };
  }, []);

  return (
    <section ref={ref} className="journey" aria-labelledby="journey-title">
      <StaticSvg as="div" className="journey-sky" aria-hidden="true">
        {import.meta.env.SSR ? <SkyBody /> : null}
      </StaticSvg>
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
        <Drift kind="lantern" />
        <div className="prelude-words">
          {/* Lit word by word as it is read (journey.css) */}
          <p className="prelude-lead font-display">
            {LEAD_SENTENCES.map(({ words, start }, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <span className="prelude-sentence">
                  {words.map((word, k) => (
                    <Fragment key={k}>
                      {k > 0 && " "}
                      <span className="prelude-word" style={cssVars({ "--w": start + k })}>{word}</span>
                    </Fragment>
                  ))}
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
            <span className="prelude-line-intro">{PRELUDE.line}</span>{" "}
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
        <div className="prelude-branch">
          <BoughSegment name="prelude" />
        </div>
      </div>

      <Chapter copy={CHAPTERS.capture} segment="spring" drift="petal">
        <Panel clip="capture" />
      </Chapter>
      <Chapter copy={CHAPTERS.plan} segment="summer" prev="spring" drift="firefly">
        <Panel clip="plan" />
      </Chapter>
      <Chapter copy={CHAPTERS.time} segment="autumn" prev="summer" drift="leaf">
        <Panel clip="schedule" />
      </Chapter>
      <Emilie />
      <Chapter copy={CHAPTERS.rhythm} segment="winter" drift="snow">
        <Panel clip="routines" />
      </Chapter>
      <Chapter copy={CHAPTERS.today} segment="today" prev="winter" drift="lantern">
        <Panel clip="reset" />
      </Chapter>

      <Constellation />

      <Finale />
    </section>
  );
}
