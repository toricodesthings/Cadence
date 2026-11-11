import { ButtonLink } from "~/components/ButtonLink";
import { ArrowIcon } from "~/components/icons";
import { StaticSvg } from "~/components/StaticSvg";
import { cssVars } from "~/lib/geometry";
import { FINALE, SIGN_UP_URL } from "~/lib/site";

import { BoughSegment, segmentHeight } from "./BoughSegment";
import { Drift } from "./Drift";
import { FinaleLand } from "./FinaleLand";
import { SkyBody } from "./FinaleSkyScene";
import { Sigil } from "./Sigil";

/* The crown opens over a quiet invitation. Petals, lanterns and the valley carry the fantasy scenery;
 * the stationary blossom frames one glass link, followed by a single reassurance. */

export function Finale() {
  return (
    <section className="finale" aria-labelledby="finale-title">
      <StaticSvg as="div" className="finale-sky" aria-hidden="true">
        {import.meta.env.SSR ? <SkyBody /> : null}
      </StaticSvg>

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
