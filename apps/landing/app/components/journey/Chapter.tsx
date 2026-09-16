import type { ReactNode } from "react";

import { cssVars } from "~/lib/geometry";
import type { ChapterCopy, Season } from "~/lib/site";

import { BoughSegment, segmentHeight, type SegmentName } from "./BoughSegment";
import { Drift, type DriftKind } from "./Drift";

/**
 * One chapter of the journey: the words on one side, the panel on the other, the bough's segment in the
 * gutter between (and behind both), and the season's particles in the air. The section's aspect is its
 * segment's, so the bough registers with the layout.
 */
export function Chapter({
  copy,
  segment,
  prev,
  drift,
  children,
}: {
  copy: ChapterCopy;
  segment: SegmentName;
  /** The season of the section above, which the bough's halo carries over the joint (the lantern if omitted). */
  prev?: Season;
  drift: DriftKind;
  children?: ReactNode;
}) {
  const titleId = `chapter-${copy.id}`;
  return (
    <section
      className="jsec chapter"
      data-season={copy.season}
      data-prev={prev}
      data-panel={copy.panel}
      aria-labelledby={titleId}
      style={cssVars({ "--h": segmentHeight(segment) })}
    >
      <BoughSegment name={segment} />
      <Drift kind={drift} />
      <div className="chapter-words">
        <p className="chapter-eyebrow reveal" style={cssVars({ "--i": 0 })}>
          {copy.eyebrow}
        </p>
        <h3 id={titleId} className="chapter-title reveal font-display" style={cssVars({ "--i": 1 })}>
          {copy.title}
        </h3>
        <p className="chapter-body reveal" style={cssVars({ "--i": 2 })}>
          {copy.body}
        </p>
        <ul className="chapter-glints">
          {copy.glints.map((glint, k) => (
            <li key={glint} className="glint reveal" style={cssVars({ "--i": 3 + k })}>
              <span className="glint-star" aria-hidden="true" />
              {glint}
            </li>
          ))}
        </ul>
      </div>
      <div className="chapter-panel reveal-panel" aria-hidden="true">
        {children}
      </div>
    </section>
  );
}
