import { StaticSvg } from "~/components/StaticSvg";

import { LandLayers } from "./HeroLandscapeScene";

/** The hero's ground: drawn once at build time, never hydrated. */
export function HeroLandscape() {
  return (
    <StaticSvg as="div" className="hero-land" data-depth={3} data-axis="x" aria-hidden="true">
      {import.meta.env.SSR ? <LandLayers /> : null}
    </StaticSvg>
  );
}
