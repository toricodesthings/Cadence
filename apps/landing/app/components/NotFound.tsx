import { useEffect } from "react";

import { ButtonLink } from "~/components/ButtonLink";
import { HeroBough } from "~/components/hero/HeroBough";
import { startIntro } from "~/lib/intro";
import { NOT_FOUND } from "~/lib/site";

/**
 * The 404: the same night, framed by the hero's portrait pair (section 11 of the plan — the motif follows the
 * reader onto every route). The boughs grow in exactly as they do on the home page; the hold the head script
 * sets is lifted here, since no Hero is mounted to lift it (without JS it lifts itself after three seconds).
 */
export function NotFound() {
  useEffect(() => startIntro(), []);

  return (
    <main id="main" className="hero lost">
      <div className="hero-layer hero-sky" aria-hidden="true" />
      <div className="hero-layer hero-dusk" aria-hidden="true" />
      <HeroBough name="pl" className="hero-bough-pl" />
      <HeroBough name="pr" className="hero-bough-pr" />
      <div className="lost-copy">
        <p className="lost-eyebrow">404</p>
        <h1 className="lost-title font-display">{NOT_FOUND.title}</h1>
        <p className="lost-line">{NOT_FOUND.line}</p>
        <ButtonLink href="/" variant="ghost" className="mt-7">
          {NOT_FOUND.back}
        </ButtonLink>
      </div>
    </main>
  );
}
