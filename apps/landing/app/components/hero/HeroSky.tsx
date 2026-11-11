import { StaticSvg } from "~/components/StaticSvg";

import { HeroSkyStage } from "./HeroSkyStage";

/** The night sky: two gradient layers, then the stage (moon, stars, twinkles, comets), which is drawn once at build time. */
export function HeroSky() {
  return (
    <>
      <div className="hero-layer hero-sky" aria-hidden="true" />
      <div className="hero-layer hero-dusk" aria-hidden="true" />
      <StaticSvg as="div" className="hero-stage" data-depth={4} aria-hidden="true">
        {import.meta.env.SSR ? <HeroSkyStage /> : null}
      </StaticSvg>
    </>
  );
}
