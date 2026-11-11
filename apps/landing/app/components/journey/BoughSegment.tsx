import { StaticSvg } from "~/components/StaticSvg";

import { mobileBoughSide, type SegmentName } from "./boughSpecs";
import { SegmentDrawing, StrandBody } from "./BoughSegmentScene";

export { mobileBoughSide, segmentHeight } from "./boughSpecs";
export type { SegmentName } from "./boughSpecs";

/*
 * The journey's weeping bough (a shidare-ume), one segment per section. A quieter
 * copper tint than the hero's boughs, built to grow on scroll instead of on a clock:
 * - every segment's main limb starts at (500, 0) and ends at (500, h) heading
 *   straight down, and its section has the same aspect as its viewBox, so the
 *   segments meet head to tail with no gap or kink whatever the width;
 * - the main limb is one slice of a single long taper (w0 → wEnd), so the page
 *   reads as one branch from one tree;
 * - its growth runs on the section's view timeline (journey.css), and nothing
 *   that grows is blurred (the halo is two faint strokes), so a scroll frame
 *   repaints strokes, never a filter;
 * - it always passes behind the panels and the words, never over them.
 * The last segment is the crown. On narrow and portrait screens the segments
 * give way to alternating gutter strands with curved crossings between features;
 * the crown continues from the final left gutter to the right.
 */

/** Which bough frame: crown, prelude or feature, wide or mobile (a crossing has none). */
function boughVariant(crossing: boolean, crown: boolean, entrance: boolean, mobile: boolean) {
  if (crossing) return "";
  if (crown) return mobile ? " bough-crown-mobile" : " bough-crown-wide";
  if (entrance) return mobile ? " bough-prelude-mobile" : " bough-prelude-wide";
  return " bough-feature-wide";
}

/** One drawing: its frame is drawn once at build time and never hydrated (StaticSvg). */
function Drawing({ name, crossing = false }: { name: SegmentName; crossing?: boolean }) {
  const mobile = crossing || name.endsWith("-mobile");
  const crown = name === "finale" || name === "finale-mobile";
  const entrance = name === "prelude" || name === "prelude-mobile";
  return (
    <StaticSvg as="div" className={`bough${boughVariant(crossing, crown, entrance, mobile)}`} aria-hidden="true">
      {import.meta.env.SSR ? <SegmentDrawing name={name} crossing={crossing} /> : null}
    </StaticSvg>
  );
}

export function BoughSegment({ name }: { name: SegmentName }) {
  return name === "finale" || name === "prelude" ? (
    <>
      <Drawing name={name} />
      <Drawing name={`${name}-mobile`} />
    </>
  ) : name.endsWith("-mobile") ? <Drawing name={name} /> : (
    <>
      <Drawing name={name} />
      <div className="bough bough-mobile" data-side={mobileBoughSide(name)} aria-hidden="true">
        <StaticSvg className="bough-strand" viewBox="0 0 24 1000" preserveAspectRatio="none" focusable="false">
          {import.meta.env.SSR ? <StrandBody /> : null}
        </StaticSvg>
        <div className="bough-crossing">
          <Drawing name={name} crossing />
        </div>
      </div>
    </>
  );
}
