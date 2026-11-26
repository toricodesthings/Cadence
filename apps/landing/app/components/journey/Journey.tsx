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

const LEAD_SENTENCES = PRELUDE.lead.split(/(?<=\.)\s+/).map((sentence, i, sentences) => ({
    words: sentence.split(" "),
    start: sentences.slice(0, i).reduce((count, previous) => count + previous.split(" ").length, 0),
}));

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
        if (!scrubs) root.classList.add("is-live");
        const finale = root.querySelector(".finale");
        const crown = root.querySelector(".finale-crown");
        let stopCrown: (() => void) | undefined;
        const onSection = (section: Element, share: number, near: boolean) => {
            section.classList.toggle("is-offscreen", share === 0);
            section.classList.toggle("is-far", !near);
            if (!scrubs && share >= 0.2) section.classList.add("is-grown");
            if (section === finale && near && !stopCrown && crown) {
                // The crown lives inside the finale, which the browser skips until it is near (content-visibility).
                requestAnimationFrame(() => {
                    stopCrown ??= watchViewport([crown], onSection, { steps: [0.2], margin: 0.25 });
                });
            }
        };
        const stopSections = watchViewport(
            Array.from(root.querySelectorAll(":scope > .jsec, .finale, .journey-mist")),
            onSection,
            { steps: [0.2], margin: 0.25 },
        );
        const branches = Array.from(root.querySelectorAll(".prelude-branch, .bough-crossing"));
        const stopBranches = !scrubs
            ? watchViewport(
                  branches,
                  (el, share) => {
                      if (share >= 0.2) el.classList.add("is-grown");
                  },
                  { steps: [0.2] },
              )
            : undefined;
        const stopClips = watchViewport(
            Array.from(root.querySelectorAll<HTMLVideoElement>(".panel-clip")),
            (el, share, near) => tendClip(el as HTMLVideoElement, near, share > 0),
            { margin: 1 },
        );
        return () => {
            stopSections();
            stopCrown?.();
            stopBranches?.();
            stopClips();
        };
    }, []);

    return (
        <section ref={ref} className="journey" aria-labelledby="journey-title">
            <StaticSvg as="div" className="journey-sky" aria-hidden="true">
                {import.meta.env.SSR ? <SkyBody /> : null}
            </StaticSvg>
            <div className="journey-fade" aria-hidden="true" />
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
                    <p className="prelude-lead font-display">
                        {LEAD_SENTENCES.map(({ words, start }, i) => (
                            <Fragment key={i}>
                                {i > 0 && " "}
                                <span className="prelude-sentence">
                                    {words.map((word, k) => (
                                        <Fragment key={k}>
                                            {k > 0 && " "}
                                            <span className="prelude-word" style={cssVars({ "--w": start + k })}>
                                                {word}
                                            </span>
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
                            <svg
                                className="prelude-swash"
                                viewBox="0 0 200 16"
                                preserveAspectRatio="none"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <defs>
                                    <linearGradient id="prelude-swash" x1="0" x2="1">
                                        <stop offset="0" stopColor="var(--hero-crest)" stopOpacity="0.2" />
                                        <stop offset="0.7" stopColor="var(--hero-crest)" />
                                        <stop offset="1" stopColor="color-mix(in srgb, var(--hero-crest) 50%, white)" />
                                    </linearGradient>
                                </defs>
                                <path className="prelude-swash-ink" d="M3,11C46,3 118,2 197,8" pathLength={1} />
                            </svg>
                            {YEAR_SPARKS.map(([x, y, d]) => (
                                <span
                                    key={x}
                                    className="prelude-spark"
                                    style={cssVars({ "--x": `${x}%`, "--y": `${y}%`, "--d": `${d}s` })}
                                    aria-hidden="true"
                                />
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
