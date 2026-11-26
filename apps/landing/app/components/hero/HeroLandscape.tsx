import { StaticSvg } from "~/components/StaticSvg";

import { LandLayers } from "./HeroLandscapeScene";

export function HeroLandscape() {
    return (
        <StaticSvg as="div" className="hero-land" data-depth={3} data-axis="x" aria-hidden="true">
            {import.meta.env.SSR ? <LandLayers /> : null}
        </StaticSvg>
    );
}
