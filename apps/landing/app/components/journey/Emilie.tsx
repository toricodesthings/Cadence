import { cssVars } from "~/lib/geometry";
import { EMILIE } from "~/lib/site";

import { BoughSegment, segmentHeight } from "./BoughSegment";
import { Drift } from "./Drift";
import { Panel } from "./Panel";
import { Sigil } from "./Sigil";

/**
 * The keystone: Emilie, between autumn and winter, the page's one full-width chapter. She wears no season:
 * her light is the lantern's, the same ember that has ridden the bough's growth front down the page. The
 * app draws her as a light, never a face, so the page does too: a core in a sigil, beside the conversation.
 */
export function Emilie() {
  return (
    <section
      className="jsec emilie"
      data-prev="autumn"
      aria-labelledby="chapter-emilie"
      style={cssVars({ "--h": segmentHeight("emilie") })}
    >
      <BoughSegment name="emilie" />
      <Drift kind="mote" />
      <div className="emilie-words">
        <p className="chapter-eyebrow reveal" style={cssVars({ "--i": 0 })}>
          {EMILIE.eyebrow}
        </p>
        <h3 id="chapter-emilie" className="chapter-title reveal font-display" style={cssVars({ "--i": 1 })}>
          {EMILIE.title}
        </h3>
        <p className="chapter-body reveal" style={cssVars({ "--i": 2 })}>
          {EMILIE.body}
        </p>
        <ul className="chapter-glints emilie-glints">
          {EMILIE.glints.map((glint, k) => (
            <li key={glint} className="glint reveal" style={cssVars({ "--i": 3 + k })}>
              <span className="glint-star" aria-hidden="true" />
              {glint}
            </li>
          ))}
        </ul>
      </div>
      <div className="emilie-stage" aria-hidden="true">
        <Sigil className="emilie-sigil reveal" style={cssVars({ "--i": 0 })}>
          <span className="emilie-core" />
        </Sigil>
        <div className="chapter-panel emilie-panel reveal-panel">
          <Panel />
        </div>
      </div>
    </section>
  );
}
