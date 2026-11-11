import { StaticSvg } from "~/components/StaticSvg";

import { FinaleLandScene } from "./FinaleLandScene";

/** The finale's valley: drawn once at build time (FinaleLandScene), never hydrated. */
export function FinaleLand() {
  return (
    <StaticSvg as="div" className="finale-land" aria-hidden="true">
      {import.meta.env.SSR ? <FinaleLandScene /> : null}
    </StaticSvg>
  );
}
